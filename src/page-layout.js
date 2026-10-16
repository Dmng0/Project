// PDF text has no guaranteed table semantics. Recover conservative, aligned
// columns from glyph positions; leave ambiguous layouts as normal prose.
export function pageLayout(lines) {
  let offset = 0;
  const source = lines.map((line, index) =>
    line.map((p) => {
      const part = { ...p, sourceStart: p.sourceStart ?? offset, line: index };
      offset += p.text.length;
      return part;
    }),
  );
  const rows = [];
  for (const part of source.flat()) {
    if (
      !part.text.trim() ||
      !Number.isFinite(part.y) ||
      !Number.isFinite(part.width)
    )
      continue;
    let row = rows.find((r) => Math.abs(r.y - part.y) < 3);
    if (!row) {
      row = { y: part.y, parts: [] };
      rows.push(row);
    }
    row.parts.push(part);
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    row.font = Math.max(...row.parts.map((p) => p.fontSize || 12));
    row.cells = [];
    let edge = -Infinity;
    for (const part of row.parts) {
      if (!row.cells.length || part.x - edge > Math.max(14, row.font * 1.6))
        row.cells.push([]);
      row.cells.at(-1).push(part);
      edge = Math.max(edge, part.x + part.width);
    }
  }
  const tables = [],
    used = new Set();
  for (let i = 0; i < rows.length; ) {
    const first = rows[i];
    if (first.cells.length < 2) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < rows.length) {
      const next = rows[end],
        prev = rows[end - 1];
      if (
        next.cells.length !== first.cells.length ||
        prev.y - next.y > Math.max(prev.font, next.font) * 3.2 ||
        !next.cells.every(
          (cell, c) => Math.abs(cell[0].x - first.cells[c][0].x) < first.font,
        )
      )
        break;
      end++;
    }
    if (end - i >= 2) {
      const selected = rows.slice(i, end);
      const indices = [
        ...new Set(selected.flatMap((r) => r.parts.map((p) => p.line))),
      ];
      // Never discard text sharing the source line with a candidate table.
      const included = new Set(selected.flatMap((r) => r.parts));
      if (
        indices.every((idx) =>
          source[idx].every((p) => !p.text.trim() || included.has(p)),
        )
      ) {
        tables.push({
          kind: "table",
          first: Math.min(...indices),
          rows: selected.map((r) => r.cells),
        });
        indices.forEach((idx) => used.add(idx));
      }
    }
    i = end;
  }
  return source.flatMap((parts, index) => {
    const table = tables.find((t) => t.first === index);
    if (table) return [table];
    return used.has(index) ? [] : [{ kind: "line", parts }];
  });
}
