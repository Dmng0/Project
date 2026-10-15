import React from "react";
// Shared semantic table rendering for both page and continuous text views.
export default function ProseBlocks({ paragraphs, renderPart }) {
  const result = [];
  for (let i = 0; i < paragraphs.length; ) {
    const paragraph = paragraphs[i];
    if (paragraph.table !== undefined) {
      const rows = [];
      const id = paragraph.table;
      while (i < paragraphs.length && paragraphs[i].table === id)
        rows.push(paragraphs[i++]);
      result.push(
        <div
          className="pdf-table-wrap"
          key={`table-${id}`}
          tabIndex={0}
          aria-label="PDF 표 가로 스크롤"
        >
          <table className="pdf-text-table" aria-label="PDF 표">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.cells.map((cell, c) => (
                    <td key={c}>{cell.map(renderPart)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      result.push(
        <p className={paragraph.heading ? "flow-heading" : ""} key={`p-${i}`}>
          {paragraph.parts.map(renderPart)}
        </p>,
      );
      i++;
    }
  }
  return result;
}
export function pageParagraphs(layout) {
  return layout.flatMap((block, i) =>
    block.kind === "table"
      ? block.rows.map((cells) => ({ table: i, cells }))
      : [{ parts: block.parts }],
  );
}
