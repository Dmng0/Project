import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as AndroidApp } from "@capacitor/app";
import {
  BookOpen,
  Plus,
  Search,
  Star,
  ArrowRight,
  Library,
  X,
  MoreHorizontal,
  FolderPlus,
  Check,
  Trash2,
  Grid2X2,
  List,
  Book,
  Loader2,
} from "lucide-react";
import { pdfjs } from "./pdf";
import Reader from "./Reader";
import { database, orderedBooks, defaults } from "./library";
import "./style.css";
const IconButton = ({ label, children, ...props }) => (
  <button className="icon-btn" aria-label={label} title={label} {...props}>
    {children}
  </button>
);
const colors = [
  "#b66d4b",
  "#788268",
  "#6f8490",
  "#a88a60",
  "#7d738e",
  "#b68c83",
];
function App() {
  const [books, setBooks] = useState([]),
    [loaded, setLoaded] = useState(false),
    [active, setActive] = useState(null),
    [readingScope, setReadingScope] = useState(null),
    [sort, setSort] = useState("uploaded"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [list, setList] = useState(false);
  const [settings, setSettings] = useState(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("yeobaek-settings") || "{}"),
      };
    } catch {
      return defaults;
    }
  });
  const input = useRef();
  const booksRef = useRef(books);
  booksRef.current = books;
  useEffect(() => {
    database("all")
      .then((b) => {
        setBooks(b);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
        setNotice(
          "기기 저장소에 접근할 수 없습니다. 브라우저 저장소 권한을 확인해 주세요.",
        );
      });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("yeobaek-settings", JSON.stringify(settings));
    } catch {
      setNotice("읽기 설정을 저장하지 못했습니다.");
    }
  }, [settings]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const subscription = AndroidApp.addListener("backButton", () => {
      if (active) window.dispatchEvent(new Event("yeobaek-back"));
      else AndroidApp.exitApp();
    });
    return () => {
      subscription.then((listener) => listener.remove());
    };
  }, [active]);
  async function update(id, patch) {
    const old = booksRef.current.find((b) => b.id === id);
    if (!old) return;
    try {
      const next = await database("patch", { id, patch });
      if (!next) return false;
      booksRef.current = booksRef.current.map((x) => (x.id === id ? next : x));
      setBooks((b) => b.map((x) => (x.id === id ? next : x)));
      return true;
    } catch {
      setNotice("저장 공간이 부족하거나 저장할 수 없습니다.");
      return false;
    }
  }
  async function upload(files) {
    setBusy(true);
    let count = 0;
    for (const file of files) {
      if (!/\.pdf$/i.test(file.name)) {
        setNotice("PDF 파일만 추가할 수 있습니다.");
        continue;
      }
      let doc, loadingTask;
      try {
        const blob = new Blob([await file.arrayBuffer()], {
          type: "application/pdf",
        });
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          isEvalSupported: false,
        });
        doc = await loadingTask.promise;
        const page = await doc.getPage(1),
          vp = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: vp,
        }).promise;
        const b = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.pdf$/i, ""),
          blob,
          cover: canvas.toDataURL("image/jpeg", 0.75),
          pages: doc.numPages,
          page: 1,
          favorite: false,
          series: "",
          bookmarks: [],
          created: Date.now() + count,
        };
        await database("put", b);
        setBooks((prev) => [...prev, b]);
        count++;
      } catch (e) {
        console.warn("PDF import failed", e.name, e.message);
        setNotice(
          e.name === "PasswordException"
            ? "암호로 잠긴 PDF는 잠금을 해제한 뒤 추가해 주세요."
            : `${file.name}: PDF를 읽거나 저장하지 못했습니다.`,
        );
      } finally {
        await loadingTask?.destroy();
      }
    }
    setBusy(false);
    if (count) setNotice(`${count}권을 책장에 추가했습니다.`);
    if (input.current) input.current.value = "";
  }
  const sorted = orderedBooks(books, sort);
  const visible = sorted.filter(
    (b) =>
      (filter === "all" ||
        (filter === "favorites" && b.favorite) ||
        (filter === "recent" && b.lastRead) ||
        (filter.startsWith("series:") && b.series === filter.slice(7))) &&
      b.title.toLowerCase().includes(query.toLowerCase()),
  );
  const series = [...new Set(books.map((b) => b.series).filter(Boolean))];
  const reading = sorted
    .filter((b) => b.lastRead)
    .sort((a, b) => b.lastRead - a.lastRead)[0];
  const open = (b, scope = b.series || null) => {
    setReadingScope(scope);
    setActive(b.id);
    update(b.id, { lastRead: Date.now() });
  };
  return (
    <div className="app">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => upload([...e.target.files])}
      />
      {active ? (
        <Reader
          book={books.find((b) => b.id === active)}
          books={sorted}
          scope={readingScope}
          settings={settings}
          setSettings={setSettings}
          update={update}
          close={() => setActive(null)}
          open={(b) => open(b, readingScope || b.series || null)}
          sort={sort}
          notify={setNotice}
        />
      ) : (
        <>
          <aside className="sidebar">
            <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
              <span className="brand-icon">
                <BookOpen size={22} />
              </span>
              여백<span className="brand-dot">.</span>
            </a>
            <div className="brand-caption">이야기가 머무는 곳</div>
            <div className="nav-label">MY LIBRARY</div>
            <button
              className={filter === "all" ? "nav active" : "nav"}
              onClick={() => setFilter("all")}
            >
              <Library size={18} />
              모든 책<span>{books.length}</span>
            </button>
            <button
              className={filter === "recent" ? "nav active" : "nav"}
              onClick={() => setFilter("recent")}
            >
              <BookOpen size={18} />
              최근 읽은 책
            </button>
            <button
              className={filter === "favorites" ? "nav active" : "nav"}
              onClick={() => setFilter("favorites")}
            >
              <Star size={18} />
              즐겨찾기<span>{books.filter((b) => b.favorite).length}</span>
            </button>
            <div className="nav-label series-label">
              MY SERIES
              <IconButton
                label="시리즈 만들기"
                onClick={() => setModal({ type: "series", name: "", ids: [] })}
              >
                <Plus size={16} />
              </IconButton>
            </div>
            {series.map((s) => (
              <button
                key={s}
                className={filter === `series:${s}` ? "nav active" : "nav"}
                onClick={() => setFilter(`series:${s}`)}
              >
                <Book size={17} />
                <span className="series-name">{s}</span>
                <small>{books.filter((b) => b.series === s).length}</small>
              </button>
            ))}
            {!series.length && (
              <p className="sidebar-hint">
                함께 읽을 책을
                <br />
                시리즈로 묶어 보세요.
              </p>
            )}
            <button
              className="series-add"
              onClick={() => setModal({ type: "series", name: "", ids: [] })}
            >
              <FolderPlus size={16} />새 시리즈 만들기
            </button>
            <div className="private-note">
              <span className="status-dot" />
              나만의 로컬 책장<p>파일은 이 브라우저에만 저장돼요.</p>
            </div>
          </aside>
          <main
            className="library-main"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload([...e.dataTransfer.files]);
            }}
          >
            <header className="topbar">
              <span>나만의 작은 도서관</span>
              <div>
                <span className="local-tag">
                  <span className="status-dot" />
                  LOCAL LIBRARY
                </span>
                <span className="avatar">나</span>
              </div>
            </header>
            <section className="heading">
              <div className="eyebrow">A LITTLE SPACE, A LOT OF STORIES</div>
              <h1>오늘은 어떤 이야기를 읽을까요?</h1>
              <p>좋아하는 이야기들을 모아, 나만의 속도로 읽어 보세요.</p>
            </section>
            {reading ? (
              <section className="continue-card">
                <div className="continue-art">
                  <BookOpen size={38} />
                </div>
                <div>
                  <span className="eyebrow">이어서 읽기</span>
                  <h2>{reading.title}</h2>
                  <p>
                    {reading.page} / {reading.pages} 페이지 ·{" "}
                    {Math.round((reading.page / reading.pages) * 100)}% 읽음
                  </p>
                </div>
                <button onClick={() => open(reading)}>
                  계속 읽기
                  <ArrowRight size={17} />
                </button>
              </section>
            ) : (
              <section className="welcome-card">
                <div>
                  <span className="eyebrow">YOUR NEXT CHAPTER</span>
                  <h2>책 한 권, 나만의 여백.</h2>
                  <p>PDF를 담으면 언제든 이야기가 시작됩니다.</p>
                  <button onClick={() => input.current.click()}>
                    첫 번째 책 담기
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="illustration" aria-hidden="true">
                  <div className="illus-book one">
                    STORIES
                    <br />
                    <span>FOR YOU</span>
                  </div>
                  <div className="illus-book two">
                    a quiet
                    <br />
                    moment.
                  </div>
                  <div className="illus-vase" />
                  <div className="illus-shelf" />
                </div>
              </section>
            )}
            <section className="shelf-section">
              <div className="shelf-title">
                <h2>
                  {filter === "all"
                    ? "모든 책"
                    : filter === "favorites"
                      ? "즐겨찾기"
                      : filter === "recent"
                        ? "최근 읽은 책"
                        : filter.slice(7)}
                  <span>{visible.length}</span>
                </h2>
                <button
                  className="primary"
                  onClick={() => input.current.click()}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Plus size={17} />
                  )}{" "}
                  {busy ? "책을 담는 중" : "PDF 추가"}
                </button>
              </div>
              <div className="shelf-tools">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="책장 검색"
                    placeholder="책 제목으로 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="sort-tools">
                  <select
                    aria-label="책 정렬"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="uploaded">업로드 순서</option>
                    <option value="title">제목 순서</option>
                  </select>
                  <div className="view-toggle">
                    <IconButton
                      label="격자 보기"
                      className={!list ? "icon-btn selected" : "icon-btn"}
                      onClick={() => setList(false)}
                    >
                      <Grid2X2 size={17} />
                    </IconButton>
                    <IconButton
                      label="목록 보기"
                      className={list ? "icon-btn selected" : "icon-btn"}
                      onClick={() => setList(true)}
                    >
                      <List size={18} />
                    </IconButton>
                  </div>
                </div>
              </div>
              {!loaded ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  책장을 불러오는 중
                </div>
              ) : !visible.length ? (
                <div
                  className="empty"
                  onClick={() => !query && input.current.click()}
                >
                  <div className="empty-icon">
                    <BookOpen size={34} />
                  </div>
                  <h3>{query ? "찾는 책이 없어요" : "아직 비어 있는 책장"}</h3>
                  <p>
                    {query
                      ? "다른 제목으로 검색해 보세요."
                      : "소중한 PDF를 추가해 나만의 책장을 채워 보세요."}
                  </p>
                  {!query && (
                    <button
                      className="text-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        input.current.click();
                      }}
                    >
                      PDF 파일 선택
                      <Plus size={15} />
                    </button>
                  )}
                  <small>PDF 파일을 이곳에 끌어다 놓아도 좋아요.</small>
                </div>
              ) : (
                <div className={list ? "book-list" : "book-grid"}>
                  {visible.map((b, i) => (
                    <article className="book-card" key={b.id}>
                      <button
                        className="cover"
                        style={{ "--cover": colors[i % colors.length] }}
                        onClick={() => open(b)}
                      >
                        <img src={b.cover} alt={`${b.title} 첫 페이지`} />
                        <span className="cover-shade" />
                        {b.favorite && (
                          <span className="cover-fav">
                            <Star size={13} fill="currentColor" />
                          </span>
                        )}
                        {b.series && (
                          <span className="series-badge">{b.series}</span>
                        )}
                        <span className="cover-open">
                          읽기
                          <ArrowRight size={16} />
                        </span>
                      </button>
                      <div className="book-info">
                        <h3 title={b.title}>
                          <button onClick={() => open(b)}>{b.title}</button>
                        </h3>
                        <p>
                          PDF · {b.pages}페이지
                          {b.lastRead
                            ? ` · ${Math.round((b.page / b.pages) * 100)}%`
                            : ""}
                        </p>
                        {b.lastRead && (
                          <div className="progress">
                            <span
                              style={{ width: `${(b.page / b.pages) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="book-actions">
                        <IconButton
                          label={b.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          onClick={() =>
                            update(b.id, { favorite: !b.favorite })
                          }
                        >
                          <Star
                            size={16}
                            fill={b.favorite ? "currentColor" : "none"}
                            className={b.favorite ? "favorite" : ""}
                          />
                        </IconButton>
                        <IconButton
                          label={`${b.title} 관리`}
                          onClick={() =>
                            setModal({
                              type: "edit",
                              id: b.id,
                              name: b.title,
                              series: b.series,
                            })
                          }
                        >
                          <MoreHorizontal size={18} />
                        </IconButton>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <footer className="library-footer">
              <BookOpen size={14} /> 이야기와 당신 사이, 여백.
              <span>모든 파일은 이 기기에 안전하게 보관됩니다.</span>
            </footer>
          </main>
        </>
      )}
      {modal && modal.type !== "delete" && (
        <div className="overlay" onClick={() => setModal(null)}>
          <form
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!modal.name.trim()) return;
              if (modal.type === "edit")
                await update(modal.id, {
                  title: modal.name.trim(),
                  series: modal.series.trim(),
                });
              else
                for (const id of modal.ids)
                  await update(id, { series: modal.name.trim() });
              setModal(null);
            }}
          >
            <div className="dialog-header">
              <h2>{modal.type === "edit" ? "책 관리" : "시리즈 만들기"}</h2>
              <IconButton
                label="닫기"
                onClick={() => setModal(null)}
                type="button"
              >
                <X size={20} />
              </IconButton>
            </div>
            <label>
              {modal.type === "edit" ? "책 제목" : "시리즈 이름"}
              <input
                required
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                autoFocus
              />
            </label>
            {modal.type === "edit" ? (
              <>
                <label>
                  시리즈 <small>비우면 묶음에서 해제돼요</small>
                  <input
                    list="series-options"
                    value={modal.series}
                    onChange={(e) =>
                      setModal({ ...modal, series: e.target.value })
                    }
                  />
                  <datalist id="series-options">
                    {series.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </label>
                <button
                  type="button"
                  className="delete"
                  onClick={() => setModal({ ...modal, type: "delete" })}
                >
                  <Trash2 size={16} />책 삭제
                </button>
              </>
            ) : modal.type === "delete" ? null : (
              <div className="series-pick">
                {sorted.map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      checked={modal.ids.includes(b.id)}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          ids: e.target.checked
                            ? [...modal.ids, b.id]
                            : modal.ids.filter((id) => id !== b.id),
                        })
                      }
                    />
                    {b.title}
                  </label>
                ))}
                {!books.length && <p>PDF를 추가한 뒤 책을 선택해 주세요.</p>}
              </div>
            )}
            <button
              className="primary"
              disabled={modal.type === "series" && !modal.ids.length}
            >
              저장
            </button>
          </form>
        </div>
      )}
      {modal?.type === "delete" && (
        <div className="overlay">
          <div className="dialog">
            <h2>책을 삭제할까요?</h2>
            <p>이 PDF와 읽던 위치, 북마크가 기기에서 삭제됩니다.</p>
            <div className="dialog-buttons">
              <button onClick={() => setModal(null)}>취소</button>
              <button
                className="delete"
                onClick={async () => {
                  try {
                    await database("delete", modal.id);
                    setBooks((b) => b.filter((x) => x.id !== modal.id));
                    setModal(null);
                  } catch {
                    setNotice("삭제하지 못했습니다.");
                  }
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
