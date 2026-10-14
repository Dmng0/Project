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
import { scopedBooks } from "../src/library.js";
import { marginPageNumber, safeLink, pdfLines } from "../src/pdf-model.js";
test("folder-scoped reading excludes other folders and respects order", () => {
  const b = [
    { ...books[0], series: "A" },
    { ...books[1], series: "B" },
    { ...books[2], series: "A" },
  ];
  assert.deepEqual(
    scopedBooks(b, "A").map((x) => x.id),
    ["a", "c"],
  );
  assert.equal(nextBook(scopedBooks(b, "A"), "a", "uploaded"), null);
  assert.equal(scopedBooks(b, null).length, 3);
});
test("hide margin page numbers while retaining numbers in the story", () => {
  assert.equal(
    marginPageNumber({ str: "- 12 -", transform: [1, 0, 0, 1, 100, 20] }, 600),
    true,
  );
  assert.equal(
    marginPageNumber({ str: "12", transform: [1, 0, 0, 1, 100, 300] }, 600),
    false,
  );
  assert.equal(
    marginPageNumber(
      { str: "Chapter 12", transform: [1, 0, 0, 1, 100, 580] },
      600,
    ),
    false,
  );
});
test("PDF links allow web URLs and block executable schemes", () => {
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("file:///secret"), null);
  assert.equal(safeLink("https://example.com"), "https://example.com/");
});
test("text extraction maps TOC annotations and drops only margin numbers", () => {
  const items = [
    {
      str: "Chapter 2",
      height: 16,
      width: 100,
      transform: [16, 0, 0, 16, 30, 450],
      hasEOL: true,
    },
    { str: "12", height: 12, width: 20, transform: [12, 0, 0, 12, 200, 20] },
  ];
  const lines = pdfLines(
    items,
    [
      {
        subtype: "Link",
        rect: [25, 445, 140, 475],
        dest: [1, { name: "Fit" }],
      },
    ],
    600,
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0].link.dest[0], 1);
  assert.equal(lines[0][0].text, "Chapter 2");
});
import { quotationRanges } from "../src/pdf-model.js";
test("annotations match across line breaks and preserve an exact repeated selection", () => {
  const text = "A quiet morning. A quiet morning.";
  const ranges = quotationRanges(text, [
    {
      id: "n",
      quote: "A quiet\nmorning.",
      anchorView: "text",
      start: 17,
      end: 33,
    },
  ]);
  assert.equal(ranges[0].start, 17);
  assert.equal(ranges[0].end, 33);
  assert.equal(
    quotationRanges("Across line breaks.", [
      { quote: "Across\nline breaks." },
    ])[0].end,
    19,
  );
});
