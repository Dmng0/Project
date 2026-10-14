export function orderedBooks(books, sort = "uploaded") {
  return [...books].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      (sort === "title"
        ? a.title.localeCompare(b.title, "ko", { numeric: true })
        : a.created - b.created),
  );
}
export function nextBook(books, id, sort) {
  const list = orderedBooks(books, sort);
  return list[list.findIndex((b) => b.id === id) + 1] || null;
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
    const r =
      action === "all"
        ? s.getAll()
        : action === "put"
          ? s.put(value)
          : action === "patch"
            ? s.get(value.id)
            : s.delete(value);
    let result;
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
  bars: true,
  cropTop: 0,
  cropBottom: 0,
};

export function scopedBooks(books, scope) {
  return scope ? books.filter((b) => b.series === scope) : books;
}
