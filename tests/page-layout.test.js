import { test } from "node:test";
import assert from "node:assert/strict";
import { pageLayout } from "../src/page-layout.js";
import {
  buildFlow,
  flowNoteRanges,
  pagedFlowNoteRanges,
} from "../src/flow-text.js";
const part = (text, x, y, link = null) => ({
  text,
  x,
  y,
  width: text.length * 6,
  fontSize: 12,
  link,
});

test("reconstruct aligned table cells even when a PDF stores text column by column", () => {
  const lines = [
    [part("Before.", 35, 600)],
    [part("Name ", 40, 500)],
    [part("Apple ", 40, 480)],
    [part("Pear ", 40, 460)],
    [part("Count ", 200, 500)],
    [part("2 ", 200, 480)],
    [part("3 ", 200, 460)],
    [part("After.", 35, 400)],
  ];
  const layout = pageLayout(lines);
  assert.deepEqual(
    layout.map((b) => b.kind),
    ["line", "table", "line"],
  );
  assert.deepEqual(
    layout[1].rows.map((r) => r.map((c) => c.map((p) => p.text).join(""))),
    [
      ["Name ", "Count "],
      ["Apple ", "2 "],
      ["Pear ", "3 "],
    ],
  );
  const original = lines
    .flat()
    .map((p) => p.text)
    .join("");
  for (const cell of layout[1].rows.flat())
    for (const p of cell)
      assert.equal(
        original.slice(p.sourceStart, p.sourceStart + p.text.length),
        p.text,
      );
  const run = buildFlow([{ num: 1, plain: original, lines }])[0];
  assert.equal(run.paragraphs.filter((p) => p.cells).length, 3);
  assert.equal(run.paragraphs.length, 5);
  assert.equal(run.text, "Before. Name Count Apple 2 Pear 3 After.");
  const apple = run.parts.find((p) => p.text.trim() === "Apple");
  const note = {
    id: "n",
    quote: "Apple",
    page: 1,
    anchorView: "flow",
    flowRun: 1,
    start: apple.start,
    end: apple.start + 5,
  };
  assert.equal(flowNoteRanges(run, [note])[0].start, apple.start);
  const mapped = pagedFlowNoteRanges([run], [note], 1)[0];
  assert.equal(original.slice(mapped.start, mapped.end), "Apple");
});

test("ordinary word spacing, a single multi-part line, and indented prose stay as prose", () => {
  const lines = [
    [part("A quiet ", 35, 500), part("morning", 85, 500)],
    [part("The next ", 35, 480), part("paragraph.", 92, 480)],
    [part("Indented.", 50, 450)],
    [part("left", 35, 420), part("right", 300, 420)],
  ];
  assert.ok(pageLayout(lines).every((b) => b.kind === "line"));
});

test("table detection preserves links and leaves misaligned ambiguous text untouched", () => {
  const link = { dest: "next" };
  const lines = [
    [part("Chapter ", 35, 500), part("Page", 200, 500)],
    [part("Next ", 35, 480, link), part("2", 200, 480)],
  ];
  const layout = pageLayout(lines);
  assert.equal(layout[0].kind, "table");
  assert.equal(layout[0].rows[1][0][0].link, link);
  const unaligned = [
    lines[0],
    [part("Different columns.", 85, 480), part("3", 300, 480)],
  ];
  assert.ok(pageLayout(unaligned).every((b) => b.kind === "line"));
});
