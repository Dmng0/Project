import { test } from "node:test";
import assert from "node:assert/strict";
import { orderedBooks, nextBook, pageText } from "../src/library.js";
const books = [
  { id: "a", title: "2권", created: 2, favorite: false },
  { id: "b", title: "1권", created: 3, favorite: false },
  { id: "c", title: "10권", created: 1, favorite: true },
];
test("favorites pinned with stable upload order; input not mutated", () => {
  assert.deepEqual(
    orderedBooks(books).map((b) => b.id),
    ["c", "a", "b"],
  );
  assert.equal(books[0].id, "a");
});
test("title order is numeric and favorites remain pinned", () =>
  assert.deepEqual(
    orderedBooks(books, "title").map((b) => b.id),
    ["c", "b", "a"],
  ));
test("continuous reading follows selected order and ends at last book", () => {
  assert.equal(nextBook(books, "c", "title").id, "b");
  assert.equal(nextBook(books, "a", "title"), null);
});
test("PDF line extraction groups same baseline and honors explicit breaks", () => {
  assert.equal(
    pageText([
      { str: "Hello", transform: [1, 0, 0, 1, 0, 100] },
      { str: "world", transform: [1, 0, 0, 1, 30, 100], hasEOL: true },
      { str: "Next", transform: [1, 0, 0, 1, 0, 80] },
    ]),
    "Hello world\nNext",
  );
});
