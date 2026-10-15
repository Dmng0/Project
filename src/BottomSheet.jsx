import React, { useRef, useState, useLayoutEffect } from "react";
import { X } from "lucide-react";
export default function BottomSheet({
  title,
  kind,
  close,
  children,
  composing = false,
}) {
  const [height, setHeight] = useState(50);
  const drag = useRef(null);
  const body = useRef(null);
  const baseline = useRef(window.innerHeight);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height || window.innerHeight,
    top: window.visualViewport?.offsetTop || 0,
  }));
  useLayoutEffect(() => {
    const visual = window.visualViewport;
    const measure = () => {
      baseline.current = Math.max(baseline.current, window.innerHeight);
      setViewport({
        height: visual?.height || window.innerHeight,
        top: visual?.offsetTop || 0,
      });
    };
    measure();
    visual?.addEventListener("resize", measure);
    visual?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      visual?.removeEventListener("resize", measure);
      visual?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    if (!composing) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (body.current?.contains(active) && active.tagName === "TEXTAREA")
        active.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [composing, viewport.height, viewport.top]);
  const keyboard = composing && baseline.current - viewport.height > 100;
  const sheetHeight = keyboard
    ? viewport.height * 0.94
    : Math.min((window.innerHeight * height) / 100, viewport.height * 0.9);
  const resize = (e) => {
    if (!drag.current) return;
    setHeight(
      Math.max(
        28,
        Math.min(
          90,
          drag.current.height +
            ((drag.current.y - e.clientY) / window.innerHeight) * 100,
        ),
      ),
    );
  };
  return (
    <div
      className="reader-overlay resizable-overlay"
      style={{ top: viewport.top, height: viewport.height, bottom: "auto" }}
      onClick={close}
    >
      <section
        className={`bottom-sheet resizable-sheet ${kind === "settings" ? "settings-sheet" : ""}`}
        style={{
          height: sheetHeight,
          maxHeight: viewport.height,
          minHeight: Math.min(window.innerHeight * 0.28, viewport.height * 0.5),
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={title}
      >
        <div
          className="sheet-grip"
          role="slider"
          tabIndex={0}
          aria-label={`${title} 높이 조절`}
          aria-valuemin={28}
          aria-valuemax={90}
          aria-valuenow={Math.round(height)}
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, height };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={resize}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setHeight((h) =>
                Math.max(28, Math.min(90, h + (e.key === "ArrowUp" ? 5 : -5))),
              );
            }
          }}
        >
          <span className="sheet-handle" />
          <span className="grip-caption">위아래로 끌어 높이 조절</span>
        </div>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="패널 닫기" onClick={close}>
            <X size={21} />
          </button>
        </div>
        <div className="sheet-body" ref={body}>
          {children}
        </div>
      </section>
    </div>
  );
}
