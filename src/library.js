export function orderedBooks(books, sort = "uploaded", scope = null) {
  const key = scope ? "seriesOrder" : "manualOrder";
  const uploaded = (a, b) => a.created - b.created || a.id.localeCompare(b.id);
  const rank = (book) =>
    Number.isFinite(book[key]) ? book[key] : book.created;
  return [...books].sort((a, b) => {
    const pinned = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (pinned) return pinned;
    if (sort === "title")
      return (
        a.title.localeCompare(b.title, "ko", { numeric: true }) ||
        uploaded(a, b)
      );
    if (sort === "manual") return rank(a) - rank(b) || uploaded(a, b);
    return uploaded(a, b);
  });
}
export function nextBook(books, id, sort, scope = null) {
  const list = orderedBooks(books, sort, scope);
  const index = list.findIndex((b) => b.id === id);
  return index < 0 ? null : list[index + 1] || null;
}
export function moveInList(items, active, over) {
  const from = items.indexOf(active),
    to = items.indexOf(over);
  if (from < 0 || to < 0) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
export function reorderBookPatches(books, active, over, sort, scope = null) {
  const list = orderedBooks(
      scope ? books.filter((b) => b.series === scope) : books,
      sort,
      scope,
    ),
    a = list.find((b) => b.id === active),
    b = list.find((b) => b.id === over);
  if (!a || !b || Boolean(a.favorite) !== Boolean(b.favorite)) return null;
  const ids = moveInList(
      list.map((b) => b.id),
      active,
      over,
    ),
    key = scope ? "seriesOrder" : "manualOrder";
  return ids.map((id, i) => ({ id, patch: { [key]: i } }));
}
export function folderMembershipPatches(books, name, ids) {
  const selected = new Set(ids),
    existing = orderedBooks(
      books.filter((b) => b.series === name),
      "manual",
      name,
    );
  const retained = existing.filter((b) => selected.has(b.id)),
    added = ids
      .map((id) => books.find((b) => b.id === id))
      .filter((b) => b && b.series !== name);
  return [...retained, ...added]
    .map((b, i) => ({ id: b.id, patch: { series: name, seriesOrder: i } }))
    .concat(
      existing
        .filter((b) => !selected.has(b.id))
        .map((b) => ({ id: b.id, patch: { series: "", seriesOrder: null } })),
    );
}
export function pageText(items) {
  const lines = [];
  let line = "",
    lastY = null;
  for (const item of items) {
    if (!("str" in item)) continue;
    const y = item.transform?.[5];
    if (lastY !== null && Math.abs(y - lastY) > 4 && line) {
      lines.push(line.trim());
      line = "";
    }
    line += item.str + (item.hasEOL ? "" : " ");
    lastY = y;
    if (item.hasEOL) {
      lines.push(line.trim());
      line = "";
      lastY = null;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.filter(Boolean).join("\n");
}
const openDB = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open("yeobaek-library", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("books", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function database(action, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      "books",
      action === "all" ? "readonly" : "readwrite",
    );
    const s = tx.objectStore("books");
    let result;
    if (action === "batch") {
      result = [];
      for (const change of value) {
        const r = s.get(change.id);
        r.onsuccess = () => {
          if (!r.result) return;
          const next = { ...r.result, ...change.patch };
          s.put(next);
          result.push(next);
        };
      }
    } else {
      const r =
        action === "all"
          ? s.getAll()
          : action === "put"
            ? s.put(value)
            : action === "patch"
              ? s.get(value.id)
              : s.delete(value);
      r.onsuccess = () => {
        if (action === "patch") {
          if (!r.result) {
            result = null;
            return;
          }
          result = { ...r.result, ...value.patch };
          s.put(result);
        } else result = r.result;
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const themes = [
  { id: "paper", name: "화이트", bg: "#fffdf8", ink: "#302d29" },
  { id: "night", name: "다크", bg: "#202321", ink: "#d8ded8" },
  { id: "sand", name: "샌드", bg: "#efe4cd", ink: "#514735" },
  { id: "sage", name: "세이지", bg: "#e4ece1", ink: "#344637" },
  { id: "mist", name: "미스트", bg: "#e3e8ef", ink: "#354354" },
];
export const defaults = {
  mode: "paged",
  view: "text",
  font: "serif",
  size: 19,
  line: 1.9,
  margin: 24,
  theme: "paper",
  indent: true,
  continuous: false,
};

export function scopedBooks(books, scope) {
  return scope ? books.filter((b) => b.series === scope) : books;
}
