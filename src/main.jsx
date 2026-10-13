import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as AndroidApp } from "@capacitor/app";
import {
  BookOpen,
  Plus,
  Search,
  Star,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Settings,
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
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import worker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  database,
  orderedBooks,
  nextBook,
  pageText,
  themes,
  defaults,
} from "./library";
import "./style.css";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
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
    const subscription = AndroidApp.addListener('backButton', () => {
      if (active) window.dispatchEvent(new Event('yeobaek-back'));
      else AndroidApp.exitApp();
    });
    return () => { subscription.then(listener => listener.remove()); };
  }, [active]);
  async function update(id, patch) {
    const old = booksRef.current.find((b) => b.id === id);
    if (!old) return;
    const next = { ...old, ...patch };
    try {
      await database("put", next);
      setBooks((b) => b.map((x) => (x.id === id ? next : x)));
    } catch {
      setNotice("저장 공간이 부족하거나 저장할 수 없습니다.");
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
      let doc;
      try {
        const blob = new Blob([await file.arrayBuffer()], {
          type: "application/pdf",
        });
        doc = await pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
        }).promise;
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
        setNotice(
          e.name === "PasswordException"
            ? "암호로 잠긴 PDF는 잠금을 해제한 뒤 추가해 주세요."
            : `${file.name}: PDF를 읽거나 저장하지 못했습니다.`,
        );
      } finally {
        await doc?.destroy();
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
  const open = (b) => {
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
          settings={settings}
          setSettings={setSettings}
          update={update}
          close={() => setActive(null)}
          open={open}
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
function PdfCanvas({ doc, num }) {
  const canvas = useRef(),
    container = useRef();
  const [visible, setVisible] = useState(false),
    [ratio, setRatio] = useState(0.707);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "600px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false,
      task;
    doc
      .getPage(num)
      .then((p) => {
        if (disposed) return;
        const base = p.getViewport({ scale: 1 });
        setRatio(base.width / base.height);
        if (!visible) {
          canvas.current.width = 0;
          canvas.current.height = 0;
          return;
        }
        const viewport = p.getViewport({
          scale: Math.min(1.5, 1600 / base.width),
        });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        task = p.render({ canvasContext: c.getContext("2d"), viewport });
        return task.promise;
      })
      .catch((e) => {
        if (e.name !== "RenderingCancelledException") console.error(e);
      });
    return () => {
      disposed = true;
      task?.cancel();
    };
  }, [doc, num, visible]);
  return (
    <div ref={container} style={{ aspectRatio: ratio }} className="pdf-frame">
      <canvas
        ref={canvas}
        className="pdf-canvas"
        aria-label={`${num}페이지 원본`}
      />
    </div>
  );
}
function Reader({
  book,
  books,
  settings: s,
  setSettings,
  update,
  close,
  open,
  sort,
  notify,
}) {
  const [doc, setDoc] = useState(null),
    [texts, setTexts] = useState([]),
    [page, setPage] = useState(book.page || 1),
    [bars, setBars] = useState(s.bars),
    [panel, setPanel] = useState(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const scroller = useRef(),
    touch = useRef(),
    pageRef = useRef(page);
  pageRef.current = page;
  const theme = themes.find((t) => t.id === s.theme) || themes[0];
  useEffect(() => {
    let alive = true,
      pdf;
    setLoading(true);
    setDoc(null);
    setTexts([]);
    setError("");
    setPage(book.page || 1);
    (async () => {
      try {
        pdf = await pdfjs.getDocument({
          data: new Uint8Array(await book.blob.arrayBuffer()),
        }).promise;
        const ts = [];
        for (let i = 1; i <= pdf.numPages; i++)
          ts.push(
            pageText((await (await pdf.getPage(i)).getTextContent()).items),
          );
        if (alive) {
          setDoc(pdf);
          setTexts(ts);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError(
            "PDF를 열지 못했습니다. 책장으로 돌아가 파일을 다시 추가해 주세요.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
      pdf?.destroy();
    };
  }, [book.id]);
  useEffect(() => {
    const t = setTimeout(
      () => update(book.id, { page, lastRead: Date.now() }),
      350,
    );
    return () => clearTimeout(t);
  }, [page, book.id]);
  function go(n) {
    if (n > book.pages) {
      if (!s.continuous) {
        notify("마지막 페이지입니다. 연속 보기를 켜면 다음 PDF로 이동합니다.");
        return;
      }
      if (s.continuous) {
        const next = nextBook(books, book.id, sort);
        if (next) {
          update(book.id, { page: book.pages, lastRead: Date.now() });
          open(next);
          return;
        }
        notify("책장의 마지막 책입니다.");
      }
      return;
    }
    const p = Math.max(1, Math.min(book.pages, n));
    setPage(p);
    if (s.mode === "scroll")
      scroller.current
        ?.querySelector(`[data-page="${p}"]`)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    else scroller.current?.scrollTo({ top: 0 });
  }
  useEffect(() => {
    if (!doc || s.mode !== "scroll") return;
    const t = setTimeout(
      () =>
        scroller.current
          ?.querySelector(`[data-page="${pageRef.current}"]`)
          ?.scrollIntoView({ block: "start" }),
      80,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setPage(Number(visible[0].target.dataset.page));
      },
      { root: scroller.current, rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );
    scroller.current
      ?.querySelectorAll("[data-page]")
      .forEach((el) => observer.observe(el));
    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [doc, s.mode, s.view]);
  useEffect(() => {
    function key(e) {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(pageRef.current + 1);
      if (e.key === "ArrowLeft") go(pageRef.current - 1);
      if (e.key === "Escape") panel ? setPanel(null) : close();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [book.id, s.mode, s.continuous, doc, panel, books]);
  useEffect(() => {
    const back = () => {
      if (panel) setPanel(null);
      else { update(book.id, {page:pageRef.current, lastRead:Date.now()}); close(); }
    };
    window.addEventListener('yeobaek-back', back);
    return () => window.removeEventListener('yeobaek-back', back);
  }, [book.id, panel]);
  const setting = (key, value) => setSettings((v) => ({ ...v, [key]: value }));
  const toggleBookmark = () =>
    update(book.id, {
      bookmarks: book.bookmarks.includes(page)
        ? book.bookmarks.filter((p) => p !== page)
        : [...book.bookmarks, page].sort((a, b) => a - b),
    });
  const content = (n) => (
    <article className="reading-page" key={n} data-page={n}>
      <div className="page-kicker">
        {book.title}
        <span>{n}</span>
      </div>
      {s.view === "original" || !texts[n - 1]?.trim() ? (
        <>
          {s.view === "text" && (
            <p className="scan-note">
              텍스트가 없는 페이지는 원본으로 표시합니다.
            </p>
          )}
          <PdfCanvas doc={doc} num={n} />
        </>
      ) : (
        <div
          className={`prose ${s.indent ? "indent" : ""}`}
          style={{
            fontFamily:
              s.font === "serif"
                ? 'Georgia, "Noto Serif KR", serif'
                : s.font === "mono"
                  ? "monospace"
                  : "Arial, sans-serif",
            fontSize: s.size,
            lineHeight: s.line,
          }}
        >
          {texts[n - 1].split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      <div className="page-end">
        {n} / {book.pages}
      </div>
    </article>
  );
  return (
    <div
      className={`reader ${bars || panel ? "bars-visible" : ""}`}
      style={{
        "--read-bg": theme.bg,
        "--read-ink": theme.ink,
        "--read-margin": `${s.margin}px`,
      }}
    >
      <header className="reader-top">
        <IconButton
          label="책장으로 돌아가기"
          onClick={() => {
            update(book.id, { page, lastRead: Date.now() });
            close();
          }}
        >
          <ArrowLeft size={21} />
        </IconButton>
        <h1>{book.title}</h1>
        <div className="reader-tools">
          <IconButton label="본문 검색" onClick={() => setPanel("search")}>
            <Search size={20} />
          </IconButton>
          <IconButton label="북마크" onClick={() => setPanel("bookmarks")}>
            <Bookmark
              size={20}
              fill={book.bookmarks.includes(page) ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton label="다른 PDF 보기" onClick={() => setPanel("books")}>
            <Library size={20} />
          </IconButton>
          <IconButton label="읽기 설정" onClick={() => setPanel("settings")}>
            <Settings size={20} />
          </IconButton>
        </div>
      </header>
      <main
        className="reading-scroll"
        ref={scroller}
        onClick={() => !panel && setBars((v) => !v)}
        onTouchStart={(e) =>
          (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })
        }
        onTouchEnd={(e) => {
          if (!touch.current || s.mode !== "paged") return;
          const dx = e.changedTouches[0].clientX - touch.current.x,
            dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
            go(page + (dx < 0 ? 1 : -1));
          touch.current = null;
        }}
      >
        {loading ? (
          <div className="reader-loading">
            <Loader2 className="spin" />
            <p>이야기를 펼치는 중…</p>
          </div>
        ) : error ? (
          <div className="reader-loading">
            {error}
            <button onClick={close}>책장으로 돌아가기</button>
          </div>
        ) : (
          doc && (
            <>
              {s.mode === "paged"
                ? content(page)
                : texts.map((_, i) => content(i + 1))}
              <div className="chapter-nav" onClick={(e) => e.stopPropagation()}>
                <button
                  disabled={page === 1 && s.mode === "paged"}
                  onClick={() => go(page - 1)}
                >
                  <ChevronLeft size={18} />
                  이전 페이지
                </button>
                <button
                  disabled={
                    (s.mode === "scroll" || page === book.pages) &&
                    !s.continuous
                  }
                  onClick={() =>
                    go(s.mode === "scroll" ? book.pages + 1 : page + 1)
                  }
                >
                  {page === book.pages || s.mode === "scroll"
                    ? "다음 책"
                    : "다음 페이지"}
                  <ChevronRight size={18} />
                </button>
              </div>
            </>
          )
        )}
      </main>
      <footer className="reader-bottom">
        <IconButton
          label="이전 페이지"
          onClick={() => go(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft size={20} />
        </IconButton>
        <span>{page}</span>
        <input
          aria-label="페이지 이동"
          type="range"
          min="1"
          max={book.pages}
          value={page}
          onChange={(e) => go(Number(e.target.value))}
        />
        <span>{book.pages}</span>
        <IconButton label="다음 페이지" onClick={() => go(page + 1)}>
          <ChevronRight size={20} />
        </IconButton>
        <span className="reader-percent">
          {Math.round((page / book.pages) * 100)}%
        </span>
      </footer>
      {!bars && !panel && (
        <button
          className="show-controls"
          aria-label="읽기 도구 표시"
          onClick={() => setBars(true)}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      {panel && (
        <div className="reader-overlay" onClick={() => setPanel(null)}>
          <section
            className={`bottom-sheet ${panel === "settings" ? "settings-sheet" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="dialog-header">
              <h2>
                {
                  {
                    settings: "읽기 설정",
                    search: "본문 검색",
                    bookmarks: "북마크",
                    books: "다른 책 펼치기",
                  }[panel]
                }
              </h2>
              <IconButton label="패널 닫기" onClick={() => setPanel(null)}>
                <X size={21} />
              </IconButton>
            </div>
            {panel === "settings" ? (
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
                  [
                    "indent",
                    "첫 문장 들여쓰기",
                    "텍스트 문단의 첫 줄을 들여씁니다.",
                  ],
                  [
                    "continuous",
                    "연속 보기",
                    "현재 정렬 순서의 다음 PDF로 이동합니다.",
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
                        if (key === "bars") setBars(!s[key]);
                      }}
                    >
                      <span />
                    </button>
                  </div>
                ))}
                <p className="setting-note">
                  글꼴·크기·행간·들여쓰기는 텍스트 보기에 적용됩니다. PDF의 문단
                  구조에 따라 원문과 줄바꿈이 다를 수 있어요. 스캔본의 OCR은
                  지원하지 않습니다.
                </p>
              </>
            ) : panel === "search" ? (
              <>
                <div className="search-field">
                  <Search size={18} />
                  <input
                    autoFocus
                    placeholder="본문에서 찾을 단어"
                    aria-label="본문 검색어"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="result-list">
                  {search.trim() ? (
                    texts
                      .map((t, i) => ({
                        t,
                        i,
                        pos: t.toLowerCase().indexOf(search.toLowerCase()),
                      }))
                      .filter((r) => r.pos >= 0)
                      .map((r) => (
                        <button
                          key={r.i}
                          onClick={() => {
                            go(r.i + 1);
                            setPanel(null);
                          }}
                        >
                          <strong>{r.i + 1}페이지</strong>
                          <p>
                            {r.t.slice(Math.max(0, r.pos - 25), r.pos + 80)}
                          </p>
                        </button>
                      ))
                  ) : (
                    <p>PDF 전체의 추출된 텍스트를 검색합니다.</p>
                  )}
                  {search.trim() &&
                    !texts.some((t) =>
                      t.toLowerCase().includes(search.toLowerCase()),
                    ) && (
                      <p>검색 결과가 없습니다. 스캔본은 검색할 수 없어요.</p>
                    )}
                </div>
              </>
            ) : panel === "bookmarks" ? (
              <>
                <button className="primary" onClick={toggleBookmark}>
                  <Bookmark size={16} />
                  {book.bookmarks.includes(page)
                    ? "현재 페이지 북마크 해제"
                    : "현재 페이지 북마크 추가"}
                </button>
                <div className="result-list">
                  {book.bookmarks.map((n) => (
                    <div className="bookmark-row" key={n}>
                      <button
                        onClick={() => {
                          go(n);
                          setPanel(null);
                        }}
                      >
                        {n}페이지
                        <span>
                          {texts[n - 1]?.slice(0, 60) || "원본 페이지"}
                        </span>
                      </button>
                      <IconButton
                        label={`${n}페이지 북마크 삭제`}
                        onClick={() =>
                          update(book.id, {
                            bookmarks: book.bookmarks.filter((p) => p !== n),
                          })
                        }
                      >
                        <X size={16} />
                      </IconButton>
                    </div>
                  ))}
                  {!book.bookmarks.length && (
                    <p>다시 만나고 싶은 문장을 남겨 보세요.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="result-list">
                {books.map((b) => (
                  <button
                    className="other-book"
                    key={b.id}
                    onClick={() => {
                      update(book.id, { page, lastRead: Date.now() });
                      open(b);
                      setPanel(null);
                    }}
                  >
                    <img src={b.cover} alt="" />
                    <div>
                      <strong>{b.title}</strong>
                      <p>
                        {b.series ? `${b.series} · ` : ""}
                        {b.pages}페이지
                      </p>
                    </div>
                    {b.id === book.id && <Check size={18} />}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
