import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import worker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export { pdfjs };

import { collectFormat, formatTextItems } from "./pdf-format";
import { novelLines } from "./novel-text";
import { pdfLines, marginPageNumber, itemRectangle } from "./pdf-model";
export { safeLink, viewportRectangle } from "./pdf-model";
export async function extractPage(doc, num) {
  const p = await doc.getPage(num),
    viewport = p.getViewport({ scale: 1 });
  const [text, annotations, operators] = await Promise.all([
    p.getTextContent(),
    p.getAnnotations({ intent: "display" }),
    p.getOperatorList().catch(() => null),
  ]);
  const getFont = (id) => {
    try {
      return p.commonObjs.get(id) || {};
    } catch {
      return {};
    }
  };
  const painting = operators
    ? collectFormat(operators, pdfjs.OPS, getFont)
    : { glyphs: [], rules: [] };
  const styledItems = formatTextItems(
    text.items,
    painting,
    getFont,
    annotations,
  );
  const lines = pdfLines(styledItems, annotations, p.view[3] - p.view[1]);
  let hasArtwork;
  if (!novelLines(lines).length) {
    const paints = new Set(
      [
        pdfjs.OPS.constructPath,
        pdfjs.OPS.stroke,
        pdfjs.OPS.fill,
        pdfjs.OPS.eoFill,
        pdfjs.OPS.fillStroke,
        pdfjs.OPS.eoFillStroke,
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.paintImageXObjectRepeat,
        pdfjs.OPS.paintImageMaskXObjectRepeat,
        pdfjs.OPS.shadingFill,
      ].filter(Number.isInteger),
    );
    hasArtwork = operators
      ? operators.fnArray.some((op) => paints.has(op))
      : true;
  }
  const data = {
    hasArtwork,
    num,
    text,
    lines,
    plain: lines
      .map((line) =>
        line
          .map((p) => p.text)
          .join("")
          .trim(),
      )
      .join("\n"),
    viewport,
    annotations,
    numberRects: text.items
      .filter((i) => marginPageNumber(i, p.view[3] - p.view[1]))
      .map((i) => itemRectangle(i, viewport)),
  };
  // Release cached painting operations/images after extracting their formatting.
  // PDF.js can load them again when the user requests the original page canvas.
  p.cleanup();
  return data;
}
export async function destinationPage(doc, dest) {
  const d = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(d) || !d.length) return null;
  return typeof d[0] === "number"
    ? d[0] + 1
    : (await doc.getPageIndex(d[0])) + 1;
}
