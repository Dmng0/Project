import React from "react";
import { Check } from "lucide-react";
import { themes } from "./library";
export default function ReaderSettings({ settings: s, setSettings, onBars }) {
  const setting = (key, value) => setSettings((v) => ({ ...v, [key]: value }));
  return (
    <>
      <div className="setting-row">
        <span>읽기 방식</span>
        <div className="segmented">
          {[
            ["paged", "좌우 넘김"],
            ["scroll", "스크롤"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={s.mode === id ? "chosen" : ""}
              onClick={() => setting("mode", id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <span>표시 방식</span>
        <div className="segmented">
          {[
            ["text", "웹소설 텍스트"],
            ["original", "PDF 원본"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={s.view === id ? "chosen" : ""}
              onClick={() => setting("view", id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="setting-row">
        글꼴
        <select
          value={s.font}
          onChange={(e) => setting("font", e.target.value)}
        >
          <option value="serif">명조</option>
          <option value="sans">고딕</option>
          <option value="mono">고정폭</option>
        </select>
      </label>
      {[
        ["size", "글자 크기", 13, 32, 1, "px"],
        ["line", "행간", 1.2, 2.8, 0.1, ""],
        ["margin", "여백", 8, 64, 4, "px"],
        ["cropTop", "원본 상단 가리기", 0, 15, 1, "%"],
        ["cropBottom", "원본 하단 가리기", 0, 15, 1, "%"],
      ].map(([key, label, min, max, step, unit]) => (
        <label className="setting-row" key={key}>
          {label}
          <div className="setting-slider">
            <input
              type="range"
              aria-label={label}
              min={min}
              max={max}
              step={step}
              value={s[key]}
              onChange={(e) => setting(key, Number(e.target.value))}
            />
            <span>
              {Number(s[key]).toFixed(key === "line" ? 1 : 0)}
              {unit}
            </span>
          </div>
        </label>
      ))}
      <div className="theme-label">테마</div>
      <div className="themes">
        {themes.map((t) => (
          <button
            key={t.id}
            aria-label={`${t.name} 테마`}
            className={s.theme === t.id ? "chosen" : ""}
            onClick={() => setting("theme", t.id)}
          >
            <span style={{ background: t.bg, color: t.ink }}>
              가{s.theme === t.id && <Check size={12} />}
            </span>
            {t.name}
          </button>
        ))}
      </div>
      {[
        ["indent", "첫 문장 들여쓰기", "텍스트 문단의 첫 줄을 들여씁니다."],
        [
          "continuous",
          "연속 보기",
          "폴더 안의 정렬 순서대로 다음 PDF로 이어집니다.",
        ],
        [
          "bars",
          "상단 · 하단바 기본 표시",
          "화면을 터치하면 도구를 숨기거나 표시합니다.",
        ],
      ].map(([key, label, detail]) => (
        <div className="setting-row toggle-row" key={key}>
          <div>
            {label}
            <small>{detail}</small>
          </div>
          <button
            role="switch"
            aria-checked={s[key]}
            aria-label={label}
            className={`switch ${s[key] ? "on" : ""}`}
            onClick={() => {
              setting(key, !s[key]);
              if (key === "bars") onBars(!s[key]);
            }}
          >
            <span />
          </button>
        </div>
      ))}
      <p className="setting-note">
        글꼴·크기·행간·들여쓰기는 텍스트 보기에 적용됩니다. PDF의 문단 구조에
        따라 원문과 줄바꿈이 다를 수 있어요. 스캔본의 OCR은 지원하지 않습니다.
      </p>

      <p className="setting-note">
        원문 여백의 쪽수는 자동으로 가립니다. 이미지형 쪽수는 상·하단 가리기로
        조절하세요. 가림 영역에 본문이 포함되지 않도록 확인해 주세요.
      </p>
    </>
  );
}
