import { quotationRanges } from "./pdf-model.js";
// Clean only the text presentation. Every retained span keeps its original PDF
// offsets, so notes still map back to the original page after glyph removal.
const unreadable =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b\u2060\ufeff\ufffc\ufffd\p{Co}\p{Cs}]/u;
const annotationIcon =
  /^[\s\p{S}\p{M}\u00b9\u00b2\u00b3\u2070-\u209f\u2020\u2021]+$/u;
export function novelLines(lines) {
  let sourceOffset = 0;
  return lines.flatMap((line) => {
    const result = [];
    let space = false;
    const encoded = line.map((p) => p.rawText || "").join("");
    const beforeSpace = /^\s/u.test(encoded);
    const afterSpace = /\s$/u.test(encoded);
    for (let pi = 0; pi < line.length; pi++) {
      const original = line[pi],
        next = line[pi + 1];
      const tight =
        typeof original.rawText === "string" &&
        original.text === original.rawText + " " &&
        /[\p{L}\p{N}]$/u.test(original.rawText) &&
        /^[\p{L}\p{N}]/u.test(next?.rawText || "") &&
        Number.isFinite(original.width) &&
        Number.isFinite(next?.x) &&
        next.x - original.x - original.width < (original.fontSize || 12) * 0.15;
      const base = original.sourceStart ?? sourceOffset;
      sourceOffset += original.text.length;
      const visible = [...original.text]
        .filter((c) => !unreadable.test(c))
        .join("");
      if (
        (original.annotation || original.link) &&
        annotationIcon.test(visible.trim())
      )
        continue;
      let chunk = null;
      for (let i = 0; i < original.text.length; ) {
        const char = String.fromCodePoint(original.text.codePointAt(i));
        const at = i;
        i += char.length;
        if (
          unreadable.test(char) ||
          (tight && at === original.text.length - 1)
        ) {
          chunk = null;
          continue;
        }
        const whitespace = /\s/u.test(char);
        if (whitespace && space) {
          chunk = null;
          continue;
        }
        space = whitespace;
        const text = whitespace ? " " : char;
        if (!chunk || chunk.sourceStart + chunk.text.length !== base + at) {
          chunk = { ...original, text: "", sourceStart: base + at };
          result.push(chunk);
        }
        chunk.text += text;
      }
    }
    while (result.length && !result[0].text.trim()) result.shift();
    while (result.length && !result.at(-1).text.trim()) result.pop();
    if (!result.length || result.every((p) => /^[\s\p{Cf}]*$/u.test(p.text)))
      return [];
    const first = result[0],
      last = result.at(-1);
    const left = first.text.length - first.text.trimStart().length;
    first.text = first.text.slice(left);
    first.sourceStart += left;
    last.text = last.text.trimEnd();
    first.breakBeforeSpace = beforeSpace;
    last.breakAfterSpace = afterSpace;
    return [result];
  });
}

export function compactNovelText(text) {
  return [...text]
    .filter((c) => !unreadable.test(c) && !/\s/u.test(c))
    .join("");
}
export function novelQuotationRanges(text, notes) {
  return notes
    .flatMap((note) => {
      const clean = [...note.quote].filter((c) => !unreadable.test(c)).join("");
      if (
        note.anchorView === "text" &&
        Number.isInteger(note.start) &&
        Number.isInteger(note.end) &&
        compactNovelText(clean) &&
        compactNovelText(text.slice(note.start, note.end)) ===
          compactNovelText(clean)
      )
        return [{ start: note.start, end: note.end, note }];
      const match = quotationRanges(text, [{ ...note, quote: clean }]);
      if (match.length) return match;
      const quote = compactNovelText(clean);
      if (!quote) return [];
      let compact = "";
      const map = [];
      for (let i = 0; i < text.length; ) {
        const char = String.fromCodePoint(text.codePointAt(i));
        const at = i;
        i += char.length;
        if (/\s/u.test(char) || unreadable.test(char)) continue;
        compact += char;
        for (let j = 0; j < char.length; j++) map.push(at + j);
      }
      const at = compact.indexOf(quote);
      return at < 0
        ? []
        : [{ start: map[at], end: map[at + quote.length - 1] + 1, note }];
    })
    .sort((a, b) => a.start - b.start);
}
