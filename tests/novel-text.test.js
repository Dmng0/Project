import { test } from "node:test";
import assert from "node:assert/strict";
import {
  novelLines,
  compactNovelText,
  novelQuotationRanges,
} from "../src/novel-text.js";
import {
  buildFlow,
  flowNoteRanges,
  pagedFlowNoteRanges,
  flowSearch,
} from "../src/flow-text.js";
import { pdfLines } from "../src/pdf-model.js";
const part = (text, x = 35, y = 500, extra = {}) => ({
  text,
  x,
  y,
  fontSize: 12,
  ...extra,
});
const page = (num, lines, extra = {}) => ({
  num,
  lines,
  plain: lines
    .flat()
    .map((p) => p.text)
    .join("\n"),
  ...extra,
});

test("unfinished Korean words cross large gaps, indentation and pages without inserted spaces", () => {
  const flow = buildFlow([
    page(1, [
      [part("그는 조용히 생각", 35, 500)],
      [part("하", 70, 350)],
      [part("고 있었다", 35, 300)],
    ]),
    page(2, [
      [part("는 사실을 알았다.", 50, 500)],
      [part("다음 문장이다.", 35, 400)],
    ]),
  ]);
  assert.equal(
    flow[0].text,
    "그는 조용히 생각하고 있었다는 사실을 알았다. 다음 문장이다.",
  );
  assert.equal(flow[0].paragraphs.length, 2);
  assert.equal(flowSearch(flow, "생각하고 있었다는")[0].num, 1);
});

test("real encoded PDF whitespace survives while synthetic spaces between touching glyphs disappear", () => {
  const item = (str, x, y, width, hasEOL = false) => ({
    str,
    transform: [12, 0, 0, 12, x, y],
    height: 12,
    width,
    hasEOL,
  });
  const lines = pdfLines(
    [
      item("생", 35, 500, 12),
      item("각", 47, 500, 12, true),
      item("하", 35, 480, 12, true),
      item("고 ", 35, 460, 24, true),
      item("있다.", 35, 440, 30, true),
    ],
    [],
    600,
  );
  const run = buildFlow([page(1, lines)])[0];
  assert.equal(run.text, "생각하고 있다.");
  const source = lines
    .flat()
    .map((p) => p.text)
    .join("");
  for (const p of run.parts.filter((p) => !p.separator))
    assert.equal(source.slice(p.sourceStart, p.sourceEnd), p.text);
});

test("whitespace-only lines and blank pages disappear without breaking a sentence or losing page anchors", () => {
  const run = buildFlow([
    page(1, [
      [part("이야기", 35, 500)],
      [part("   \t\u3000", 35, 480)],
      [part("\u200b\ufeff\u200c", 35, 460)],
    ]),
    page(2, [], { hasArtwork: false }),
    page(3, [[part("는 계속된다.", 35, 500)]]),
    page(4, [], { hasArtwork: false }),
    page(5, [[part("다음 이야기.", 35, 500)]]),
  ])[0];
  assert.equal(run.text, "이야기는 계속된다. 다음 이야기.");
  assert.equal(run.paragraphs.length, 2);
  assert.deepEqual(
    run.parts.filter((p) => p.anchor).map((p) => p.page),
    [2, 4],
  );
  assert.equal(
    buildFlow([page(1, [], { hasArtwork: false })])[0].kind,
    "anchor",
  );
  assert.equal(buildFlow([page(1, [], { hasArtwork: true })])[0].kind, "scan");
});

test("hide invalid/control/private-use glyphs and annotation icons, preserving readable links and story symbols", () => {
  const lines = [
    [
      part("문\ufffd장\ue000이\u0000다. ★", 35, 500),
      part("➜", 160, 500, { link: { dest: "next" }, annotation: true }),
    ],
    [part("읽을 수 있는 링크", 35, 480, { link: { dest: "next" } })],
    [part("†", 35, 460, { annotation: true })],
    [part("별표 ★와 수식 x²는 유지.", 35, 440)],
  ];
  const original = JSON.stringify(lines),
    cleaned = novelLines(lines);
  assert.equal(JSON.stringify(lines), original);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[0].map((p) => p.text).join(""), "문장이다. ★");
  assert.equal(cleaned[1][0].link.dest, "next");
  const run = buildFlow([page(1, lines)])[0];
  assert.ok(run.text.includes("별표 ★와 수식 x²는 유지."));
  assert.ok(!/[\ufffd\ue000\u0000➜†]/u.test(run.text));
});

test("old notes survive changed wrap spaces, and new notes map exactly around removed glyphs", () => {
  const pages = [
    page(1, [[part("생\ufffd각", 35, 500)], [part("한다.", 35, 480)]]),
  ];
  const flow = buildFlow(pages),
    run = flow[0];
  const old = {
    id: "old",
    page: 1,
    anchorView: "flow",
    flowRun: 1,
    quote: "생 각 한다.",
    start: 0,
    end: 8,
  };
  const range = flowNoteRanges(run, [old])[0];
  assert.equal(run.text.slice(range.start, range.end), "생각한다.");
  const note = {
    id: "new",
    page: 1,
    anchorView: "flow",
    flowRun: 1,
    quote: "생각한다.",
    start: 0,
    end: 5,
  };
  const mapped = pagedFlowNoteRanges(flow, [note], 1);
  const raw = pages[0].lines
    .flat()
    .map((p) => p.text)
    .join("");
  assert.equal(
    mapped.map((r) => raw.slice(r.start, r.end)).join(""),
    "생각한다.",
  );
  assert.equal(compactNovelText("생\ufffd 각\u200b"), "생각");
  const paged = novelQuotationRanges("문\ufffd장이다.", [
    {
      id: "paged",
      page: 1,
      quote: "문장",
      anchorView: "text",
      start: 0,
      end: 3,
    },
  ])[0];
  assert.deepEqual([paged.start, paged.end], [0, 3]);
  const fallback = novelQuotationRanges("문\ufffd장이다.", [
    { id: "fallback", page: 1, quote: "문장" },
  ])[0];
  assert.deepEqual([fallback.start, fallback.end], [0, 3]);
});
