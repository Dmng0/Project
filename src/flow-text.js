import {
  novelLines,
  novelQuotationRanges,
  compactNovelText,
} from "./novel-text.js";
import { pageLayout } from "./page-layout.js";
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
    breakBeforeSpace: parts[0]?.breakBeforeSpace,
    breakAfterSpace: parts.at(-1)?.breakAfterSpace,
    font: median(measured.map((p) => p.fontSize)) || 12,
  };
}
function boundary(previous, current) {
  if (!previous) return true;
  if (heading.test(previous.text) || heading.test(current.text)) return true;
  if (current.font > previous.font * 1.2 || previous.font > current.font * 1.2)
    return true;
  if (/^[“‘「『"'•●※]/u.test(current.text) || /^[-–—]\s+\S/u.test(current.text))
    return true;
  return sentenceEnd.test(previous.text);
}
function joiner(previous, current) {
  const a = previous?.text || "",
    b = current.text;
  if (!a || !b) return "";
  if (/[\u00ad]$/u.test(a)) return "";
  if (/[-‐]$/u.test(a) && /^\p{L}/u.test(b)) return "";
  if (/^[,.;:!?，。！？、)”’」』]/u.test(b) || /[（(“‘「『]$/u.test(a))
    return "";
  // Keep spaces actually encoded at the PDF line edge, but never invent one
  // between Korean/CJK characters split by layout or a page boundary.
  if (previous.breakAfterSpace || current.breakBeforeSpace) return " ";
  if (
    /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(
      a,
    ) &&
    /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
      b,
    )
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
    const cleaned = novelLines(data.lines);
    if (!cleaned.length) {
      if (
        data.hasArtwork === false ||
        (data.lines.length && !data.hasArtwork)
      ) {
        if (run && paragraph) {
          const anchor = {
            text: "",
            page: data.num,
            sourceStart: 0,
            sourceEnd: 0,
            start: run.text.length,
            end: run.text.length,
            anchor: true,
          };
          run.parts.push(anchor);
          paragraph.parts.push(anchor);
          if (paragraph.cells) paragraph.cells.at(-1).push(anchor);
        } else blocks.push({ kind: "anchor", num: data.num });
        continue;
      }
      blocks.push({ kind: "scan", data });
      run = null;
      paragraph = null;
      previous = null;
      continue;
    }
    if (!run) beginRun(data.num);
    const lines = pageLayout(cleaned).flatMap((block, index) =>
      block.kind === "table"
        ? block.rows.map((cells) => ({
            ...lineInfo(cells.flat(), data.num),
            cells,
            table: `${data.num}-${index}`,
          }))
        : [lineInfo(block.parts, data.num)],
    );
    for (const line of lines) {
      if (!line.text) continue;
      const isNew = line.cells || previous?.cells || boundary(previous, line);
      if (isNew) {
        paragraph = {
          parts: [],
          heading: heading.test(line.text),
          ...(line.cells
            ? { table: line.table, cells: line.cells.map(() => []) }
            : {}),
        };
        run.paragraphs.push(paragraph);
      }
      if (run.parts.length) {
        let gap = isNew ? " " : joiner(previous, line);
        const last = run.parts.findLast((p) => p.text);
        if (!isNew && last.text.endsWith("\u00ad")) {
          last.text = last.text.slice(0, -1);
          last.end--;
          last.sourceEnd--;
          for (const anchor of run.parts.filter(
            (p) => p.anchor && p.start > last.end,
          )) {
            anchor.start--;
            anchor.end--;
          }
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
          if (paragraph.cells) paragraph.cells[0].push(space);
          run.parts.push(space);
          run.text += gap;
        }
      }
      for (let i = 0; i < line.parts.length; i++) {
        const part = line.parts[i],
          raw = part.text;
        let left = 0,
          right = raw.length;
        if (i === 0) left = raw.length - raw.trimStart().length;
        if (i === line.parts.length - 1) right = raw.trimEnd().length;
        const text = raw.slice(left, right);
        if (text) {
          const cell = line.cells?.findIndex((cell) => cell.includes(part));
          if (
            cell > 0 &&
            line.cells[cell][0] === part &&
            !/\s$/u.test(run.text)
          ) {
            const space = {
              text: " ",
              page: data.num,
              start: run.text.length,
              end: run.text.length + 1,
              separator: true,
            };
            paragraph.parts.push(space);
            paragraph.cells[cell].push(space);
            run.parts.push(space);
            run.text += " ";
          }
          const piece = {
            text,
            link: part.link,
            page: data.num,
            sourceStart: part.sourceStart + left,
            sourceEnd: part.sourceStart + right,
            start: run.text.length,
            end: run.text.length + text.length,
          };
          paragraph.parts.push(piece);
          if (paragraph.cells)
            paragraph.cells[
              line.cells.findIndex((cell) => cell.includes(part))
            ].push(piece);
          run.parts.push(piece);
          run.text += text;
        }
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
      const match = novelQuotationRanges(run.text, [
        { ...note, anchorView: "text" },
      ]);
      if (
        match.length &&
        match.every(
          (r) => r.start >= source[0].start && r.end <= source.at(-1).end,
        )
      ) {
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
          compactNovelText(run.text.slice(start, end)) ===
          compactNovelText(note.quote)
        ) {
          results.push({ start, end, note });
          continue;
        }
      }
    }
    const start = source[0].start,
      end = source.at(-1).end;
    results.push(
      ...novelQuotationRanges(run.text.slice(start, end), [
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
