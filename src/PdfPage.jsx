import React, { useRef, useState, useEffect } from "react";
import { pdfjs, safeLink, viewportRectangle } from "./pdf";
import "./pdf-text-layer.css";
export default function PdfPage({
  doc,
  data,
  onLink,
  notes = [],
  onNote,
  cropTop = 0,
  cropBottom = 0,
}) {
  const noteSignature = JSON.stringify(notes);
  const canvas = useRef(),
    container = useRef(),
    textContainer = useRef();
  const [visible, setVisible] = useState(false),
    [width, setWidth] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: "500px",
    });
    io.observe(container.current);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(container.current);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      render,
      textLayer;
    (async () => {
      if (!visible || !width) {
        canvas.current.width = 0;
        canvas.current.height = 0;
        textContainer.current.replaceChildren();
        return;
      }
      const page = await doc.getPage(data.num);
      if (cancelled) return;
      const scale = width / data.viewport.width,
        viewport = page.getViewport({ scale }),
        dpr = Math.min(window.devicePixelRatio || 1, 2),
        c = canvas.current;
      c.width = Math.ceil(viewport.width * dpr);
      c.height = Math.ceil(viewport.height * dpr);
      render = page.render({
        canvasContext: c.getContext("2d"),
        viewport,
        transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
      });
      await render.promise;
      if (cancelled) return;
      textContainer.current.replaceChildren();
      textLayer = new pdfjs.TextLayer({
        textContentSource: {
          ...data.text,
          items: data.text.items.filter(
            (i) =>
              !data.numberRects.some((r) => {
                const x = i.transform?.[4],
                  y = i.transform?.[5];
                if (x === undefined) return false;
                const pt = data.viewport.convertToViewportPoint(x, y);
                return (
                  pt[0] >= r[0] - 1 &&
                  pt[0] <= r[2] + 1 &&
                  pt[1] >= r[1] - 1 &&
                  pt[1] <= r[3] + 1
                );
              }),
          ),
        },
        container: textContainer.current,
        viewport,
      });
      await textLayer.render();
      const normalize = (s) => s.replace(/\s+/g, " ").trim();
      textContainer.current.querySelectorAll("span").forEach((span) => {
        const t = normalize(span.textContent);
        if (t.length < 3) return;
        const note = notes.find(
          (n) =>
            normalize(n.quote).includes(t) || t.includes(normalize(n.quote)),
        );
        if (note) {
          span.dataset.noteId = note.id;
          span.style.backgroundColor = "#e9c36c55";
          span.title = note.body;
          span.onclick = (e) => {
            if (window.getSelection()?.toString().trim()) return;
            e.stopPropagation();
            onNote(note);
          };
        }
      });
    })().catch((e) => {
      if (e.name !== "RenderingCancelledException" && !cancelled)
        console.error(e);
    });
    return () => {
      cancelled = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [doc, data, visible, width, noteSignature]);
  const position = (r) => ({
    left: `${(r[0] / data.viewport.width) * 100}%`,
    top: `${(r[1] / data.viewport.height) * 100}%`,
    width: `${((r[2] - r[0]) / data.viewport.width) * 100}%`,
    height: `${((r[3] - r[1]) / data.viewport.height) * 100}%`,
  });
  return (
    <div
      ref={container}
      className="pdf-frame"
      style={{
        aspectRatio: data.viewport.width / data.viewport.height,
        "--scale-factor": width / data.viewport.width,
        "--total-scale-factor": width / data.viewport.width,
      }}
    >
      <canvas
        ref={canvas}
        className="pdf-canvas"
        aria-label={`${data.num}페이지 원본`}
      />
      <div ref={textContainer} className="textLayer" />
      {data.numberRects.map((r, i) => (
        <div
          className="pdf-number-mask"
          data-testid="pdf-number-mask"
          style={position([r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 2])}
          key={i}
        />
      ))}
      {data.annotations
        .filter(
          (a) => a.subtype === "Link" && a.rect && (a.dest || safeLink(a.url)),
        )
        .map((a, i) => {
          const raw = viewportRectangle(data.viewport, a.rect),
            r = [
              Math.min(raw[0], raw[2]),
              Math.min(raw[1], raw[3]),
              Math.max(raw[0], raw[2]),
              Math.max(raw[1], raw[3]),
            ];
          return a.dest ? (
            <button
              key={i}
              className="pdf-link-area"
              style={position(r)}
              aria-label={`목차 링크 ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                onLink(a.dest);
              }}
            />
          ) : (
            <a
              key={i}
              className="pdf-link-area"
              style={position(r)}
              aria-label={`외부 링크 ${i + 1}`}
              href={safeLink(a.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}
      {cropTop > 0 && (
        <div
          className="pdf-crop-mask"
          style={{ top: 0, height: `${cropTop}%` }}
        />
      )}
      {cropBottom > 0 && (
        <div
          className="pdf-crop-mask"
          style={{ bottom: 0, height: `${cropBottom}%` }}
        />
      )}
    </div>
  );
}
