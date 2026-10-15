import { quotationRanges } from "./pdf-model.js";
const sentenceEnd = /[.!?。！？…]["'”’」』)\]]*$/u;
const heading =
  /^(?:제\s*\d+\s*[장화부편]|\d+\s*[장화부편]|chapter\s+\d+|prologue|epilogue|프롤로그|에필로그|[＊*]{3,}|[─━—]{3,})/iu;
const median = (values) => {
  const sorted = values
    .filter((n) => n > 0 && Number.isFinite(n))
    .sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
function lineText(line) {
  return line
    .map((p) => p.text)
    .join("")
    .trim();
}
function lineInfo(parts, page) {
  const measured = parts.filter((p) => Number.isFinite(p.y) && p.text.trim());
  return {
    parts,
    page,
    text: lineText(parts),
    x: measured.length ? Math.min(...measured.map((p) => p.x)) : 0,
    y: measured[0]?.y,
    font: median(measured.map((p) => p.fontSize)) || 12,
  };
}
function boundary(previous, current, typicalGap, baseX) {
  if (!previous) return true;
  if (heading.test(previous.text) || heading.test(current.text)) return true;
  const linkLine = (line) => line.parts.every((p) => !p.text.trim() || p.link);
  if (linkLine(previous) || linkLine(current)) return true;
  if (current.font > previous.font * 1.2 || previous.font > current.font * 1.2)
    return true;
  if (/^[“‘「『"'•●※]/u.test(current.text) || /^[-–—]\s+\S/u.test(current.text))
    return true;
  if (sentenceEnd.test(previous.text)) return true;
  if (
    current.page === previous.page &&
    Number.isFinite(previous.y) &&
    Number.isFinite(current.y) &&
    previous.y - current.y > typicalGap * 1.5
  )
    return true;
  if (current.x > baseX + current.font * 0.7) return true;
  return false;
}
function joiner(previous, current) {
  if (!previous || !current) return "";
  if (/[\u00ad]$/u.test(previous)) return "";
  if (/[-‐]$/u.test(previous) && /^\p{L}/u.test(current)) return "";
  if (/\s$/u.test(previous) || /^\s/u.test(current)) return " ";
  if (
    /^[,.;:!?，。！？、)”’」』]/u.test(current) ||
    /[（(“‘「『]$/u.test(previous)
  )
    return "";
  // Common Korean endings can be split in the middle by PDF line/page wrapping.
  if (
    /(?:했|되|있|없|않|었|았|겠|합니|입니|됩니|습니)$/u.test(previous) &&
    /^(?:다|던|고|지만|으며|습니다|었다|았다)/u.test(current)
  )
    return "";
  return " ";
}
export function buildFlow(pages) {
  const blocks = [];
  let run = null,
    paragraph = null,
    previous = null;
  const beginRun = (num) => {
    run = { kind: "text", id: num, paragraphs: [], parts: [], text: "" };
    blocks.push(run);
    paragraph = null;
    previous = null;
  };
  for (const data of pages) {
    if (!data.plain.trim()) {
      blocks.push({ kind: "scan", data });
      run = null;
      paragraph = null;
      previous = null;
      continue;
    }
    if (!run) beginRun(data.num);
    const lines = data.lines.map((parts) => lineInfo(parts, data.num));
    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y),
      typicalGap = median(gaps) || median(lines.map((l) => l.font)) * 1.4,
      baseX = Math.min(...lines.map((l) => l.x));
    let sourceOffset = 0;
    for (const line of lines) {
      const rawStart = sourceOffset;
      sourceOffset += line.parts.reduce((n, p) => n + p.text.length, 0);
      if (!line.text) continue;
      const isNew = boundary(previous, line, typicalGap, baseX);
      if (isNew) {
        paragraph = { parts: [], heading: heading.test(line.text) };
        run.paragraphs.push(paragraph);
      }
      if (run.parts.length) {
        let gap = isNew
          ? " "
          : joiner(run.parts.at(-1).text, line.parts[0]?.text || "");
        const last = run.parts.at(-1);
        if (!isNew && last.text.endsWith("\u00ad")) {
          last.text = last.text.slice(0, -1);
          last.end--;
          run.text = run.text.slice(0, -1);
        }
        if (gap) {
          const space = {
            text: gap,
            page: data.num,
            start: run.text.length,
            end: run.text.length + gap.length,
            separator: true,
          };
          paragraph.parts.push(space);
          run.parts.push(space);
          run.text += gap;
        }
      }
      let offset = rawStart;
      for (let i = 0; i < line.parts.length; i++) {
        const part = line.parts[i],
          raw = part.text;
        let left = 0,
          right = raw.length;
        if (i === 0) left = raw.length - raw.trimStart().length;
        if (i === line.parts.length - 1) right = raw.trimEnd().length;
        const text = raw.slice(left, right);
        if (text) {
          const piece = {
            text,
            link: part.link,
            page: data.num,
            sourceStart: offset + left,
            sourceEnd: offset + right,
            start: run.text.length,
            end: run.text.length + text.length,
          };
          paragraph.parts.push(piece);
          run.parts.push(piece);
          run.text += text;
        }
        offset += raw.length;
      }
      previous = line;
    }
  }
  return blocks;
}
export function flowNoteRanges(run, notes) {
  const results = [];
  for (const note of notes) {
    const source = run.parts.filter(
      (p) =>
        !p.separator &&
        p.page >= note.page &&
        p.page <= (note.endPage || note.page),
    );
    if (!source.length) continue;
    if (note.anchorView === "flow" && note.flowRun === run.id) {
      const match = quotationRanges(run.text, [
        { ...note, anchorView: "text" },
      ]);
      if (match.length) {
        results.push(...match);
        continue;
      }
    }
    if (
      note.anchorView === "text" &&
      Number.isInteger(note.start) &&
      Number.isInteger(note.end)
    ) {
      const mapped = source.filter(
        (p) =>
          p.page === note.page &&
          p.sourceEnd > note.start &&
          p.sourceStart < note.end,
      );
      if (mapped.length) {
        const first = mapped[0],
          last = mapped.at(-1),
          start = first.start + Math.max(0, note.start - first.sourceStart),
          end =
            last.start +
            Math.min(last.text.length, note.end - last.sourceStart);
        if (
          run.text.slice(start, end).replace(/\s+/g, " ").trim() ===
          note.quote.replace(/\s+/g, " ").trim()
        ) {
          results.push({ start, end, note });
          continue;
        }
      }
    }
    const start = source[0].start,
      end = source.at(-1).end;
    results.push(
      ...quotationRanges(run.text.slice(start, end), [
        { ...note, start: null, end: null },
      ]).map((r) => ({ ...r, start: r.start + start, end: r.end + start })),
    );
  }
  return results.sort((a, b) => a.start - b.start);
}
export function flowSearch(blocks, query) {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const run of blocks) {
    if (run.kind !== "text") continue;
    const text = run.text.toLowerCase();
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(q, offset);
      if (index < 0) break;
      const source = run.parts.find((p) => !p.separator && p.end > index);
      if (source && !results.some((r) => r.num === source.page))
        results.push({
          num: source.page,
          excerpt: run.text.slice(
            Math.max(0, index - 25),
            index + q.length + 70,
          ),
        });
      offset = index + q.length;
    }
  }
  return results;
}

export function pagedFlowNoteRanges(blocks, notes, page) {
  const relevant = notes.filter(
    (n) =>
      n.anchorView === "flow" &&
      n.page <= page &&
      (n.endPage || n.page) >= page,
  );
  if (!relevant.length) return [];
  const result = [];
  for (const block of blocks) {
    if (block.kind !== "text") continue;
    const ranges = flowNoteRanges(block, relevant);
    for (const part of block.parts) {
      if (part.separator || part.page !== page) continue;
      for (const range of ranges) {
        const start = Math.max(part.start, range.start),
          end = Math.min(part.end, range.end);
        if (end > start)
          result.push({
            start: part.sourceStart + start - part.start,
            end: part.sourceStart + end - part.start,
            note: range.note,
          });
      }
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
