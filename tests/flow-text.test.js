import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFlow, flowNoteRanges, flowSearch } from "../src/flow-text.js";
function page(num, lines) {
  return {
    num,
    plain: lines.map((l) => (typeof l === "string" ? l : l.text)).join("\n"),
    lines: lines.map((l, i) => [
      {
        text: typeof l === "string" ? l : l.text,
        link: typeof l === "object" ? l.link : null,
        x: typeof l === "object" ? l.x || 35 : 35,
        y: typeof l === "object" ? l.y : 500 - i * 18,
        fontSize: 12,
      },
    ]),
  };
}
test("line and page wrapping become a single paragraph without page-sized gaps", () => {
  const flow = buildFlow([
    page(1, ["The quiet", "story"]),
    page(2, ["continued until", "morning."]),
  ]);
  assert.equal(flow.length, 1);
  assert.equal(flow[0].paragraphs.length, 1);
  assert.equal(flow[0].text, "The quiet story continued until morning.");
  assert.deepEqual(
    [...new Set(flow[0].parts.filter((p) => !p.separator).map((p) => p.page))],
    [1, 2],
  );
});
test("preserve sentence breaks, indentation, dialogue and chapter boundaries", () => {
  const flow = buildFlow([
    page(1, [
      { text: "제1화 시작", y: 540 },
      { text: "첫 번째 문장이다.", y: 500 },
      { text: "“안녕?”", y: 482 },
      { text: "새 문단을", x: 60, y: 450 },
      { text: "계속한다.", y: 432 },
    ]),
  ]);
  assert.equal(flow[0].paragraphs.length, 4);
  assert.equal(flow[0].paragraphs[0].heading, true);
  assert.ok(flow[0].text.includes("새 문단을 계속한다."));
});
test("join common Korean verb endings split over a page boundary", () => {
  assert.equal(
    buildFlow([page(1, ["그곳에 있었다고 생각했"]), page(2, ["다."])])[0].text,
    "그곳에 있었다고 생각했다.",
  );
});
test("remove discretionary soft hyphens and retain literal word hyphens", () => {
  assert.equal(
    buildFlow([page(1, ["con\u00ad"]), page(2, ["tinued."])])[0].text,
    "continued.",
  );
  assert.equal(
    buildFlow([page(1, ["well-"]), page(2, ["known."])])[0].text,
    "well-known.",
  );
});
test("a scanned page is preserved between separate text runs", () => {
  const scan = { num: 2, plain: "", lines: [] };
  const flow = buildFlow([page(1, ["Before"]), scan, page(3, ["After."])]);
  assert.deepEqual(
    flow.map((b) => b.kind),
    ["text", "scan", "text"],
  );
  assert.equal(flow[1].data, scan);
  assert.equal(flow[2].id, 3);
});
test("links retain their source destination and page during reflow", () => {
  const link = { dest: "chapter-2" },
    flow = buildFlow([
      page(1, [{ text: "Next chapter", link }]),
      page(2, ["The story begins."]),
    ]);
  assert.equal(flow[0].parts.find((p) => p.link)?.link, link);
  assert.equal(
    flow[0].parts.find((p) => p.text === "The story begins.").page,
    2,
  );
});
test("existing page notes highlight on their own page, and flow notes span boundaries", () => {
  const run = buildFlow([
    page(1, ["The same sentence."]),
    page(2, ["The same sentence."]),
  ])[0];
  const old = flowNoteRanges(run, [
    {
      id: "old",
      page: 2,
      quote: "The same sentence.",
      anchorView: "text",
      start: 0,
      end: 18,
    },
  ]);
  assert.ok(
    old[0].start >= run.parts.find((p) => !p.separator && p.page === 2).start,
  );
  const joined = buildFlow([
      page(1, ["The story"]),
      page(2, ["continued."]),
    ])[0],
    note = {
      id: "new",
      page: 1,
      endPage: 2,
      quote: joined.text,
      start: 0,
      end: joined.text.length,
      anchorView: "flow",
      flowRun: 1,
    };
  const range = flowNoteRanges(joined, [note])[0];
  assert.equal(range.start, 0);
  assert.equal(range.end, joined.text.length);
});
test("search matches a phrase crossing PDF page boundaries", () => {
  const results = flowSearch(
    buildFlow([page(1, ["The story"]), page(2, ["continued."])]),
    "story continued",
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].num, 1);
  assert.ok(results[0].excerpt.includes("story continued"));
});
import { pagedFlowNoteRanges } from "../src/flow-text.js";
test("flow annotations map back to both original pages when changing reading mode", () => {
  const blocks = buildFlow([page(1, ["The story"]), page(2, ["continued."])]),
    note = {
      id: "flow",
      page: 1,
      endPage: 2,
      quote: blocks[0].text,
      start: 0,
      end: blocks[0].text.length,
      anchorView: "flow",
      flowRun: 1,
    };
  assert.deepEqual(
    pagedFlowNoteRanges(blocks, [note], 1).map((r) => [r.start, r.end]),
    [[0, 9]],
  );
  assert.deepEqual(
    pagedFlowNoteRanges(blocks, [note], 2).map((r) => [r.start, r.end]),
    [[0, 10]],
  );
});
