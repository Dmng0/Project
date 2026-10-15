import React, { useState } from "react";
import { X, Search } from "lucide-react";
export default function FolderEditor({ name, books, save, close }) {
  const [ids, setIds] = useState(() =>
      books.filter((b) => b.series === name).map((b) => b.id),
    ),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <div className="overlay" onClick={() => !saving && close()}>
      <form
        className="dialog folder-editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const ok = await save(ids);
          setSaving(false);
          if (ok) close();
        }}
      >
        <div className="dialog-header">
          <h2>폴더 편집</h2>
          <button
            className="icon-btn"
            aria-label="닫기"
            type="button"
            disabled={saving}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <h3>{name}</h3>
        <p className="folder-editor-help">
          체크하면 추가되고, 체크를 해제하면 폴더에서 빠집니다. PDF와 읽던
          위치는 책장에 남습니다. 다른 폴더의 책을 선택하면 이 폴더로
          이동합니다.
        </p>
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="폴더 편집 책 검색"
            placeholder="추가하거나 제외할 책 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="folder-selection-count">{ids.length}권 선택</p>
        <div className="series-pick folder-picker">
          {books
            .filter((b) => b.title.toLowerCase().includes(query.toLowerCase()))
            .map((b) => (
              <label key={b.id}>
                <input
                  type="checkbox"
                  aria-label={b.title}
                  checked={ids.includes(b.id)}
                  disabled={saving}
                  onChange={(e) =>
                    setIds((prev) =>
                      e.target.checked
                        ? [...prev, b.id]
                        : prev.filter((id) => id !== b.id),
                    )
                  }
                />
                <img src={b.cover} alt="" />
                <span>
                  {b.title}
                  <small>
                    {b.series === name
                      ? "현재 폴더"
                      : b.series
                        ? `다른 폴더: ${b.series}`
                        : "묶음 없는 책"}
                  </small>
                </span>
              </label>
            ))}
        </div>
        {!ids.length && (
          <p className="folder-editor-help">
            모든 책을 제외하면 빈 폴더는 목록에서 사라집니다.
          </p>
        )}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "저장 중…" : "폴더 저장"}
        </button>
      </form>
    </div>
  );
}
