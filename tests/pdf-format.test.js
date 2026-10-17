import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectFormat,
  formatTextItems,
  fontFormat,
  readableColor,
  colorContrast,
  textFormatStyle,
} from "../src/pdf-format.js";
import { pdfLines } from "../src/pdf-model.js";
import { buildFlow } from "../src/flow-text.js";
import { themes } from "../src/library.js";
const OPS = Object.fromEntries(
  [
    "save",
    "restore",
    "transform",
    "setFont",
    "setTextMatrix",
    "showText",
    "setFillRGBColor",
    "setStrokeRGBColor",
    "setLineWidth",
    "constructPath",
    "stroke",
    "fill",
    "setTextRenderingMode",
    "paintFormXObjectBegin",
    "paintFormXObjectEnd",
    "beginAnnotation",
    "endAnnotation",
  ].map((n, i) => [n, i]),
);
const operators = (entries) => ({
  fnArray: entries.map(([n]) => OPS[n]),
  argsArray: entries.map(([, a]) => a),
});
const glyphs = (text) =>
  [...text].map((unicode) => ({
    unicode,
    width: 500,
    isSpace: unicode === " ",
  }));
const matrix = (x, y) => [[1, 0, 0, 1, x, y]];
const font = (id) => ({
  name: id === "bold" ? "Example-Semibold" : "Example-Regular",
  bold: id === "bold",
});
const textItem = (str, x, y, width) => ({
  str,
  transform: [16, 0, 0, 16, x, y],
  fontName: "normal",
  height: 16,
  width,
  hasEOL: true,
});

test("font flags, common weight names, faux bold and text shear preserve emphasis without treating rotation as italic", () => {
  assert.equal(fontFormat({ name: "Subset+MyFont-Bold" }).bold, true);
  assert.equal(fontFormat({ name: "MyFont-Oblique" }).italic, true);
  assert.equal(fontFormat({}, [1, 0, 0.22, 1, 0, 0]).italic, true);
  assert.equal(fontFormat({}, [0, 1, -1, 0, 0, 0]).italic, false);
  assert.equal(fontFormat({}, undefined, 2).bold, true);
});
test("graphics state and transformed Form text keep their own font and color and restore correctly", () => {
  const data = collectFormat(
    operators([
      ["setFont", ["normal", 16]],
      ["setTextMatrix", matrix(35, 500)],
      ["save", null],
      ["setFillRGBColor", ["#cc0000"]],
      ["setFont", ["bold", 16]],
      ["showText", [glyphs("Bold")]],
      ["restore", null],
      ["setTextMatrix", matrix(35, 470)],
      ["showText", [glyphs("Normal")]],
      ["paintFormXObjectBegin", [[1, 0, 0, 1, 100, 100], null]],
      ["setFillRGBColor", ["#0000cc"]],
      ["setTextMatrix", matrix(20, 30)],
      ["showText", [glyphs("Form")]],
      ["paintFormXObjectEnd", null],
    ]),
    OPS,
    font,
  );
  assert.equal(data.glyphs[0].format.bold, true);
  assert.equal(data.glyphs[0].format.color, "#cc0000");
  assert.equal(data.glyphs[4].format.bold, false);
  assert.equal(data.glyphs[4].format.color, "#000000");
  assert.equal(data.glyphs[10].x, 120);
  assert.equal(data.glyphs[10].y, 130);
});
test("a merged text item splits only at visual formatting boundaries and keeps identical text and offsets", () => {
  const painting = collectFormat(
    operators([
      ["setFont", ["normal", 16]],
      ["setTextMatrix", matrix(35, 500)],
      ["setFillRGBColor", ["#cc0000"]],
      ["showText", [glyphs("Red")]],
      ["setFillRGBColor", ["#0000cc"]],
      ["showText", [glyphs("Blue")]],
      ["setStrokeRGBColor", ["#cc0000"]],
      [
        "constructPath",
        [
          OPS.stroke,
          [new Float32Array([0, 35, 497, 1, 59, 497])],
          [35, 497, 59, 497],
        ],
      ],
      [
        "constructPath",
        [
          OPS.fill,
          [
            new Float32Array([
              0, 59, 504, 1, 91, 504, 1, 91, 505, 1, 59, 505, 4,
            ]),
          ],
          [59, 504, 91, 505],
        ],
      ],
    ]),
    OPS,
    font,
  );
  const items = formatTextItems(
    [textItem("RedBlue", 35, 500, 56)],
    painting,
    font,
  );
  assert.deepEqual(
    items[0].formatRuns.map((r) => [r.start, r.end, r.format.color]),
    [
      [0, 3, "#cc0000"],
      [3, 7, "#0000cc"],
    ],
  );
  assert.equal(items[0].formatRuns[0].format.underline, true);
  assert.equal(items[0].formatRuns[1].format.strike, true);
  const lines = pdfLines(items, [], 600);
  assert.equal(
    lines
      .flat()
      .map((p) => p.text)
      .join(""),
    "RedBlue",
  );
  const run = buildFlow([{ num: 1, lines, plain: "RedBlue" }])[0];
  assert.equal(run.text, "RedBlue");
  assert.equal(run.parts[1].format.color, "#0000cc");
  assert.equal(run.parts[1].sourceStart, 3);
});
test("quad-point underline and strike annotations stay limited to their own words; distant table borders do not decorate text", () => {
  const painting = collectFormat(
    operators([
      ["setFont", ["normal", 16]],
      ["setTextMatrix", matrix(35, 500)],
      ["showText", [glyphs("MarkPlain")]],
      [
        "constructPath",
        [
          OPS.stroke,
          [new Float32Array([0, 20, 480, 1, 200, 480])],
          [20, 480, 200, 480],
        ],
      ],
    ]),
    OPS,
    font,
  );
  const result = formatTextItems(
    [textItem("MarkPlain", 35, 500, 72)],
    painting,
    font,
    [
      {
        subtype: "Underline",
        quadPoints: new Float32Array([35, 516, 67, 516, 35, 495, 67, 495]),
        rect: [35, 495, 107, 516],
        color: new Uint8Array([204, 0, 0]),
      },
      { subtype: "StrikeOut", rect: [35, 495, 67, 516] },
    ],
  )[0].formatRuns;
  assert.equal(result[0].format.underline, true);
  assert.equal(result[0].format.strike, true);
  assert.equal(result[0].format.decorationColor, "#cc0000");
  assert.equal(result[1].format.underline, undefined);
  assert.equal(result[1].format.strike, undefined);
});
test("all five themes keep the source hue where legible and adapt low contrast text, including black on dark mode", () => {
  assert.equal(
    readableColor("#cc0000", themes[0].bg, themes[0].ink),
    "#cc0000",
  );
  for (const theme of themes) {
    for (const color of [
      "#cc0000",
      "#0000cc",
      "#ffffcc",
      "#777777",
      "#ffffff",
      "#000000",
    ]) {
      const style = textFormatStyle(
        { bold: true, italic: true, underline: true, strike: true, color },
        theme,
      );
      assert.ok(
        colorContrast(style.color, theme.bg) >= 4.49,
        `${color} on ${theme.id}`,
      );
      assert.equal(style.fontWeight, 700);
      assert.equal(style.fontStyle, "italic");
      assert.equal(style.textDecorationLine, "underline line-through");
    }
  }
  assert.equal(
    textFormatStyle({ color: "#000000" }, themes[1]).color,
    themes[1].ink,
  );
  assert.equal(
    readableColor("url(unsafe)", themes[0].bg, themes[0].ink),
    themes[0].ink,
  );
});
