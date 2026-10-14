import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import worker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export { pdfjs };

import { pdfLines, marginPageNumber, itemRectangle } from "./pdf-model";
export { safeLink, viewportRectangle } from "./pdf-model";
export async function extractPage(doc, num) {
  const p = await doc.getPage(num),
    viewport = p.getViewport({ scale: 1 });
  const [text, annotations] = await Promise.all([
    p.getTextContent(),
    p.getAnnotations({ intent: "display" }),
  ]);
  const lines = pdfLines(text.items, annotations, p.view[3] - p.view[1]);
  return {
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
}
export async function destinationPage(doc, dest) {
  const d = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(d) || !d.length) return null;
  return typeof d[0] === "number"
    ? d[0] + 1
    : (await doc.getPageIndex(d[0])) + 1;
}
