import React, { useRef, useState } from "react";
import { X } from "lucide-react";
export default function BottomSheet({ title, kind, close, children }) {
  const [height, setHeight] = useState(50);
  const drag = useRef(null);
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
    <div className="reader-overlay resizable-overlay" onClick={close}>
      <section
        className={`bottom-sheet resizable-sheet ${kind === "settings" ? "settings-sheet" : ""}`}
        style={{ height: `${height}dvh` }}
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
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
