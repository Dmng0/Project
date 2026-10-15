import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Bookmark,
  Search,
  Library,
  Settings,
  MoreHorizontal,
  Loader2,
  X,
  Check,
  NotebookPen,
  ListTree,
  Plus,
  Trash2,
} from "lucide-react";
import { pdfjs, extractPage, destinationPage } from "./pdf";
import { nextBook, scopedBooks, themes, orderedBooks } from "./library";
import PdfPage from "./PdfPage";
import { quotationRanges } from "./pdf-model";
import BottomSheet from "./BottomSheet";
import ReaderSettings from "./ReaderSettings";
const IconButton = ({ label, children, ...props }) => (
  <button className="icon-btn" aria-label={label} title={label} {...props}>
    {children}
  </button>
);
const normalize = (s) => s.replace(/\s+/g, " ").trim();
export default function Reader({
  book,
  books,
  scope,
  settings: s,
  setSettings,
  update,
  close,
  open,
  sort,
  notify,
}) {
  const [doc, setDoc] = useState(null),
    [pages, setPages] = useState([]),
    [outline, setOutline] = useState([]),
    [page, setPage] = useState(book.page || 1),
    [bars, setBars] = useState(s.bars),
    [panel, setPanel] = useState(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selection, setSelection] = useState(null),
    [draft, setDraft] = useState(null);
  const scroller = useRef(),
    touch = useRef(),
    pageRef = useRef(page),
    ignoreClick = useRef(0),
    scrollIntent = useRef(0),
    lastScroll = useRef(0),
    switching = useRef(false),
    ended = useRef(false);
  pageRef.current = page;
  const theme = themes.find((t) => t.id === s.theme) || themes[0],
    allowed = orderedBooks(scopedBooks(books, scope), sort, scope),
    notes = book.notes || [];
  useEffect(() => {
    let alive = true,
      pdf,
      task;
    setLoading(true);
    setDoc(null);
    setPages([]);
    setOutline([]);
    setError("");
    setPage(book.page || 1);
    setSelection(null);
    setDraft(null);
    switching.current = false;
    ended.current = false;
    scrollIntent.current = 0;
    (async () => {
      try {
        task = pdfjs.getDocument({
          data: new Uint8Array(await book.blob.arrayBuffer()),
          isEvalSupported: false,
        });
        pdf = await task.promise;
        const content = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          if (!alive) return;
          content.push(await extractPage(pdf, n));
        }
        const toc = await pdf.getOutline();
        if (alive) {
          setPages(content);
          setOutline(toc || []);
          setDoc(pdf);
          setLoading(false);
        }
      } catch (e) {
        console.warn("PDF reader failed", e.name, e.message);
        if (alive) {
          setError("PDF를 열지 못했습니다. 파일을 다시 추가해 주세요.");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
      task?.destroy();
    };
  }, [book.id]);
  useEffect(() => {
    if (loading) return;
    const id = book.id,
      t = setTimeout(() => update(id, { page, lastRead: Date.now() }), 250);
    return () => clearTimeout(t);
  }, [page, book.id, loading]);
  const exit = () => {
    update(book.id, { page: pageRef.current, lastRead: Date.now() });
    close();
  };
  function advance() {
    if (loading || !s.continuous || switching.current) return;
    const next = nextBook(allowed, book.id, sort, scope);
    if (!next) {
      if (!ended.current) {
        notify(
          scope ? "이 폴더의 마지막 책입니다." : "책장의 마지막 책입니다.",
        );
        ended.current = true;
      }
      return;
    }
    switching.current = true;
    scrollIntent.current = 0;
    update(book.id, { page: book.pages, lastRead: Date.now() });
    open(next);
  }
  function go(n) {
    if (loading) return;
    if (n > book.pages) {
      advance();
      return;
    }
    const target = Math.max(1, Math.min(book.pages, n));
    setPage(target);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    scrollIntent.current = 0;
    if (s.mode === "scroll")
      scroller.current
        ?.querySelector(`[data-page="${target}"]`)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    else scroller.current?.scrollTo({ top: 0 });
  }
  async function follow(dest) {
    try {
      const n = await destinationPage(doc, dest);
      if (n) {
        go(n);
        setPanel(null);
      } else notify("목차의 이동 위치를 찾지 못했습니다.");
    } catch {
      notify("목차의 이동 위치를 찾지 못했습니다.");
    }
  }
  useEffect(() => {
    if (!doc) return;
    const root = scroller.current;
    let t;
    const updatePage = () => {
      if (s.mode !== "scroll") return;
      const boundary = root.getBoundingClientRect().top + 80;
      const articles = [...root.querySelectorAll("[data-page]")];
      const current = articles.find(
        (el) => el.getBoundingClientRect().bottom > boundary,
      );
      if (current) setPage(Number(current.dataset.page));
    };
    root.addEventListener("scroll", updatePage, { passive: true });
    t = setTimeout(() => {
      if (s.mode === "scroll")
        root
          .querySelector(`[data-page="${pageRef.current}"]`)
          ?.scrollIntoView({ block: "start", behavior: "instant" });
      else root.scrollTo({ top: 0 });
      lastScroll.current = root.scrollTop;
    }, 90);
    return () => {
      clearTimeout(t);
      root.removeEventListener("scroll", updatePage);
    };
  }, [doc, s.mode, s.view]);
  useEffect(() => {
    const back = () => (panel ? setPanel(null) : exit());
    const key = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight" && s.mode === "paged") go(pageRef.current + 1);
      if (e.key === "ArrowLeft" && s.mode === "paged") go(pageRef.current - 1);
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("yeobaek-back", back);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("yeobaek-back", back);
    };
  }, [book.id, panel, loading, s.mode, s.continuous, books, scope]);
  useEffect(() => {
    const changed = () => {
      if (panel) return;
      const sel = window.getSelection();
      const quote = sel?.toString().trim();
      const anchor =
        sel?.anchorNode?.nodeType === 1
          ? sel.anchorNode
          : sel?.anchorNode?.parentElement;
      const article = anchor?.closest(".reading-page");
      if (!quote || !article || !scroller.current?.contains(article)) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0),
        root =
          article.querySelector(".prose") ||
          article.querySelector(".textLayer");
      let start, end;
      if (
        root &&
        root.contains(range.startContainer) &&
        root.contains(range.endContainer)
      ) {
        const before = document.createRange();
        before.selectNodeContents(root);
        before.setEnd(range.startContainer, range.startOffset);
        start = before.toString().length;
        const through = document.createRange();
        through.selectNodeContents(root);
        through.setEnd(range.endContainer, range.endOffset);
        end = through.toString().length;
      }
      setSelection({
        quote,
        page: Number(article.dataset.page),
        start,
        end,
        anchorView: root?.classList.contains("prose") ? "text" : "original",
      });
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, [panel]);
  const atEnd = () => {
    const el = scroller.current;
    return el && el.scrollHeight - el.clientHeight - el.scrollTop < 8;
  };
  function tap(e) {
    if (
      panel ||
      loading ||
      Date.now() < ignoreClick.current ||
      e.target.closest("button,a,input,textarea,mark") ||
      window.getSelection()?.toString().trim()
    )
      return;
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width;
    if (s.mode === "paged" && x < 0.25) go(pageRef.current - 1);
    else if (s.mode === "paged" && x > 0.75) go(pageRef.current + 1);
    else setBars((v) => !v);
  }
  function startNote(note = selection) {
    setDraft(
      note?.id
        ? { ...note }
        : {
            id: null,
            page: note?.page || pageRef.current,
            quote: note?.quote || "",
            body: "",
            start: note?.start,
            end: note?.end,
            anchorView: note?.anchorView,
          },
    );
    setPanel("notes");
    setSelection(null);
  }
  async function saveNote(e) {
    e.preventDefault();
    if (!draft?.quote.trim() || !draft.body.trim()) return;
    const next = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      quote: draft.quote.trim(),
      body: draft.body.trim(),
    };
    const saved = await update(book.id, {
      notes:
        next.id && notes.some((n) => n.id === next.id)
          ? notes.map((n) => (n.id === next.id ? next : n))
          : [...notes, next],
    });
    if (!saved) return;
    setDraft(null);
    notify("주석을 저장했습니다.");
  }
  const highlighted = (text, offset, ranges) => {
    const result = [];
    let cursor = 0;
    for (const r of ranges) {
      const start = Math.max(cursor, r.start - offset),
        end = Math.min(text.length, r.end - offset);
      if (end <= start || start >= text.length) continue;
      if (start > cursor) result.push(text.slice(cursor, start));
      result.push(
        <mark
          key={`${r.note.id}-${offset}-${start}`}
          title={r.note.body}
          onClick={(e) => {
            e.stopPropagation();
            startNote(r.note);
          }}
        >
          {text.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < text.length) result.push(text.slice(cursor));
    return result.length ? result : text;
  };
  const content = (data) => {
    const fullText = data.lines
      .flat()
      .map((p) => p.text)
      .join("");
    const ranges = quotationRanges(
      fullText,
      notes.filter((n) => n.page === data.num),
    );
    let offset = 0;
    return (
      <article className="reading-page" key={data.num} data-page={data.num}>
        {s.view === "original" || !data.plain.trim() ? (
          <>
            {s.view === "text" && (
              <p className="scan-note">
                텍스트가 없는 페이지는 원본으로 표시합니다.
              </p>
            )}
            <PdfPage
              doc={doc}
              data={data}
              onLink={follow}
              notes={notes.filter((n) => n.page === data.num)}
              onNote={startNote}
              cropTop={s.cropTop}
              cropBottom={s.cropBottom}
            />
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
            {data.lines.map((parts, i) => {
              const text = parts.map((p) => p.text).join("");
              return (
                <p
                  key={i}
                  className={
                    notes.some(
                      (n) =>
                        n.page === data.num &&
                        normalize(n.quote).includes(normalize(text)) &&
                        normalize(text),
                    )
                      ? "annotated-paragraph"
                      : ""
                  }
                >
                  {parts.map((part, j) => {
                    const content = highlighted(part.text, offset, ranges);
                    offset += part.text.length;
                    return part.link ? (
                      part.link.dest ? (
                        <button
                          key={j}
                          className="text-pdf-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            follow(part.link.dest);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <a
                          key={j}
                          href={part.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {content}
                        </a>
                      )
                    ) : (
                      <React.Fragment key={j}>{content}</React.Fragment>
                    );
                  })}
                </p>
              );
            })}
          </div>
        )}
      </article>
    );
  };
  const renderOutline = (items, depth = 0) =>
    items.map((item, i) => (
      <React.Fragment key={`${depth}-${i}`}>
        <button
          className="outline-item"
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() =>
            item.dest
              ? follow(item.dest)
              : notify("이 목차에는 내부 이동 링크가 없습니다.")
          }
        >
          {item.title || "이름 없는 목차"}
        </button>
        {item.items?.length > 0 && renderOutline(item.items, depth + 1)}
      </React.Fragment>
    ));
  const groups = [...new Set(allowed.map((b) => b.series || ""))];
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
        <IconButton label="책장으로 돌아가기" onClick={exit}>
          <ArrowLeft size={21} />
        </IconButton>
        <h1 title={book.title}>{book.title}</h1>
        <div className="reader-tools">
          <IconButton label="목차" onClick={() => setPanel("toc")}>
            <ListTree size={19} />
          </IconButton>
          <IconButton label="본문 검색" onClick={() => setPanel("search")}>
            <Search size={19} />
          </IconButton>
          <IconButton label="북마크" onClick={() => setPanel("bookmarks")}>
            <Bookmark
              size={19}
              fill={book.bookmarks.includes(page) ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            label="주석"
            onClick={() => {
              setDraft(null);
              setPanel("notes");
            }}
          >
            <NotebookPen size={19} />
          </IconButton>
          <IconButton label="다른 PDF 보기" onClick={() => setPanel("books")}>
            <Library size={19} />
          </IconButton>
          <IconButton label="읽기 설정" onClick={() => setPanel("settings")}>
            <Settings size={19} />
          </IconButton>
        </div>
      </header>
      <main
        className="reading-scroll"
        ref={scroller}
        onClick={tap}
        onScroll={(e) => {
          const current = e.currentTarget.scrollTop;
          if (
            s.mode === "scroll" &&
            !loading &&
            !panel &&
            Date.now() < scrollIntent.current &&
            current > lastScroll.current &&
            atEnd()
          )
            advance();
          lastScroll.current = current;
        }}
        onWheel={(e) => {
          if (e.deltaY > 0) {
            scrollIntent.current = Date.now() + 900;
            if (s.mode === "scroll" && !panel && atEnd()) advance();
          }
        }}
        onTouchMove={() => {
          scrollIntent.current = Date.now() + 1500;
        }}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          scrollIntent.current = Date.now() + 1500;
        }}
        onTouchEnd={(e) => {
          if (!touch.current || panel) return;
          const dx = e.changedTouches[0].clientX - touch.current.x,
            dy = e.changedTouches[0].clientY - touch.current.y;
          if (
            s.mode === "paged" &&
            Math.abs(dx) > 65 &&
            Math.abs(dx) > Math.abs(dy) * 1.5
          ) {
            ignoreClick.current = Date.now() + 350;
            go(pageRef.current + (dx < 0 ? 1 : -1));
          }
          if (
            s.mode === "scroll" &&
            dy < -40 &&
            Math.abs(dy) > Math.abs(dx) &&
            atEnd()
          )
            advance();
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
            <button onClick={exit}>책장으로 돌아가기</button>
          </div>
        ) : (
          doc &&
          (s.mode === "paged" ? content(pages[page - 1]) : pages.map(content))
        )}
        {!loading && s.mode === "scroll" && (
          <div className="scroll-end-hint">
            {s.continuous
              ? "끝까지 읽고 위로 더 밀면 다음 책으로 이어집니다."
              : "이 책의 마지막입니다."}
          </div>
        )}
      </main>
      <footer className="reader-bottom">
        <input
          aria-label="페이지 이동"
          aria-valuetext={`${page} / ${book.pages}페이지`}
          type="range"
          min="1"
          max={book.pages}
          value={page}
          onChange={(e) => go(Number(e.target.value))}
        />
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
      {selection && !panel && (
        <button
          className="selection-note"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            startNote();
          }}
        >
          <NotebookPen size={17} />
          선택한 문장에 주석
        </button>
      )}
      {panel && (
        <BottomSheet
          key={panel}
          kind={panel}
          title={
            {
              settings: "읽기 설정",
              search: "본문 검색",
              bookmarks: "북마크",
              books: "다른 책 펼치기",
              toc: "목차",
              notes: "문장 주석",
            }[panel]
          }
          close={() => {
            setPanel(null);
            setDraft(null);
          }}
        >
          {panel === "settings" ? (
            <ReaderSettings
              settings={s}
              setSettings={setSettings}
              onBars={setBars}
            />
          ) : panel === "search" ? (
            <>
              <div className="search-field">
                <Search size={18} />
                <input
                  autoFocus
                  aria-label="본문 검색어"
                  placeholder="본문에서 찾을 단어"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="result-list">
                {search.trim() ? (
                  pages
                    .filter((p) =>
                      p.plain.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        key={p.num}
                        onClick={() => {
                          go(p.num);
                          setPanel(null);
                        }}
                      >
                        <strong>{p.num}페이지</strong>
                        <p>
                          {p.plain.slice(
                            Math.max(
                              0,
                              p.plain
                                .toLowerCase()
                                .indexOf(search.toLowerCase()) - 25,
                            ),
                            p.plain
                              .toLowerCase()
                              .indexOf(search.toLowerCase()) + 80,
                          )}
                        </p>
                      </button>
                    ))
                ) : (
                  <p>PDF 전체의 추출된 텍스트를 검색합니다.</p>
                )}
                {search.trim() &&
                  !pages.some((p) =>
                    p.plain.toLowerCase().includes(search.toLowerCase()),
                  ) && <p>검색 결과가 없습니다. 스캔본은 검색할 수 없어요.</p>}
              </div>
            </>
          ) : panel === "bookmarks" ? (
            <>
              <button
                className="primary"
                onClick={() =>
                  update(book.id, {
                    bookmarks: book.bookmarks.includes(page)
                      ? book.bookmarks.filter((p) => p !== page)
                      : [...book.bookmarks, page].sort((a, b) => a - b),
                  })
                }
              >
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
                        {pages[n - 1]?.plain.slice(0, 60) || "원본 페이지"}
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
          ) : panel === "toc" ? (
            <div className="result-list">
              {outline.length ? (
                renderOutline(outline)
              ) : (
                <p>
                  별도 목차가 없는 PDF입니다. 본문에 포함된 목차 링크도 누를 수
                  있습니다.
                </p>
              )}
            </div>
          ) : panel === "notes" ? (
            <>
              {draft ? (
                <form className="note-form" onSubmit={saveNote}>
                  <label>
                    인용 문장
                    <textarea
                      aria-label="인용 문장"
                      value={draft.quote}
                      onChange={(e) =>
                        setDraft({ ...draft, quote: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    주석 내용
                    <textarea
                      aria-label="주석 내용"
                      value={draft.body}
                      onChange={(e) =>
                        setDraft({ ...draft, body: e.target.value })
                      }
                      autoFocus
                      required
                    />
                  </label>
                  <div className="note-buttons">
                    <button type="button" onClick={() => setDraft(null)}>
                      취소
                    </button>
                    <button className="primary">주석 저장</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="note-help">
                    본문 문장을 길게 눌러 선택한 뒤 ‘선택한 문장에 주석’을
                    누르세요. 원본 PDF의 텍스트도 선택할 수 있습니다. 이미지에는
                    인용문을 직접 입력하세요.
                  </p>
                  <button
                    className="primary"
                    onClick={() => startNote({ page, quote: "" })}
                  >
                    <Plus size={16} />
                    주석 직접 추가
                  </button>
                </>
              )}
              <div className="result-list">
                {notes.map((note) => (
                  <div className="saved-note" key={note.id}>
                    <button
                      className="note-jump"
                      onClick={() => {
                        go(note.page);
                        setPanel(null);
                      }}
                    >
                      <blockquote>{note.quote}</blockquote>
                      <p>{note.body}</p>
                      <small>{note.page}페이지로 이동</small>
                    </button>
                    <div>
                      <button onClick={() => startNote(note)}>수정</button>
                      <IconButton
                        label="주석 삭제"
                        onClick={() =>
                          update(book.id, {
                            notes: notes.filter((n) => n.id !== note.id),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                ))}
                {!notes.length && !draft && <p>저장된 주석이 없습니다.</p>}
              </div>
            </>
          ) : (
            <div className="result-list grouped-books">
              {scope && (
                <p className="scope-note">
                  ‘{scope}’ 폴더 안의 책만 표시합니다.
                </p>
              )}
              {groups.map((group) => (
                <section key={group || "ungrouped"} className="book-folder">
                  <h3>{group || "묶음 없는 책"}</h3>
                  {allowed
                    .filter((b) => (b.series || "") === group)
                    .map((b) => (
                      <button
                        className="other-book"
                        key={b.id}
                        onClick={() => {
                          update(book.id, {
                            page: pageRef.current,
                            lastRead: Date.now(),
                          });
                          open(b);
                          setPanel(null);
                        }}
                      >
                        <img src={b.cover} alt="" />
                        <div>
                          <strong>{b.title}</strong>
                          <p>{b.pages}페이지</p>
                        </div>
                        {b.id === book.id && <Check size={18} />}
                      </button>
                    ))}
                </section>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
