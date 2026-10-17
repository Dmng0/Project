import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb, PDFName, degrees } from "pdf-lib";
import { colorContrast } from "../src/pdf-format.js";
async function fixture() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    italic = await pdf.embedFont(StandardFonts.HelveticaOblique),
    both = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const p = pdf.addPage([500, 800]),
    second = pdf.addPage([500, 800]);
  const draw = (text, y, font = regular, color = rgb(0, 0, 0), x = 35) =>
    p.drawText(text, { x, y, size: 16, font, color });
  draw("Bold red.", 720, bold, rgb(0.8, 0, 0));
  draw("Normal text.", 690);
  draw("Italic blue.", 660, italic, rgb(0, 0, 0.8));
  draw("Both styles.", 630, both);
  draw("Underline plain", 600);
  p.drawLine({
    start: { x: 35, y: 598 },
    end: { x: 35 + regular.widthOfTextAtSize("Underline", 16), y: 598 },
    thickness: 1,
  });
  draw("Strike plain", 570);
  p.drawRectangle({
    x: 35,
    y: 574,
    width: regular.widthOfTextAtSize("Strike", 16),
    height: 1,
  });
  draw("Double decoration.", 540);
  const w = regular.widthOfTextAtSize("Double decoration.", 16);
  p.drawLine({
    start: { x: 35, y: 538 },
    end: { x: 35 + w, y: 538 },
    thickness: 1,
  });
  p.drawLine({
    start: { x: 35, y: 545 },
    end: { x: 35 + w, y: 545 },
    thickness: 1,
  });
  draw("Annotation under.", 510);
  draw("Annotation strike.", 480);
  draw("Styled link.", 450, both, rgb(0, 0.4, 0));
  draw("Red", 420, regular, rgb(0.8, 0, 0));
  draw(
    "Blue.",
    420,
    regular,
    rgb(0, 0, 0.8),
    35 + regular.widthOfTextAtSize("Red", 16),
  );
  p.drawText("Slanted.", {
    x: 35,
    y: 390,
    size: 16,
    font: regular,
    xSkew: degrees(12),
  });
  draw("Pale yellow.", 360, regular, rgb(1, 1, 0.8));
  draw("Cell bold", 300, bold);
  draw("Cell italic", 300, italic, rgb(0.8, 0, 0), 250);
  draw("Next cell", 270);
  draw("Plain cell", 270, regular, rgb(0, 0, 0), 250);
  second.drawText("Second page.", { x: 35, y: 700, size: 16, font: regular });
  const ann = (type, text, y) =>
    pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: type,
        Rect: [35, y - 3, 35 + regular.widthOfTextAtSize(text, 16), y + 16],
        QuadPoints: [
          35,
          y + 16,
          35 + regular.widthOfTextAtSize(text, 16),
          y + 16,
          35,
          y - 3,
          35 + regular.widthOfTextAtSize(text, 16),
          y - 3,
        ],
        C: [0.8, 0, 0],
      }),
    );
  const link = pdf.context.register(
    pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [35, 447, 140, 466],
      Border: [0, 0, 0],
      Dest: [second.ref, "Fit"],
    }),
  );
  p.node.set(
    PDFName.of("Annots"),
    pdf.context.obj([
      ann("Underline", "Annotation under.", 510),
      ann("StrikeOut", "Annotation strike.", 480),
      link,
    ]),
  );
  return {
    name: "Formatting.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
}
async function open(page) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(await fixture());
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("Bold red.");
}
const span = (page, text) =>
  page
    .locator(".prose .pdf-formatted")
    .filter({
      hasText: new RegExp(
        "^\\s*" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$",
      ),
    })
    .first();
async function checkStyles(page) {
  await expect(span(page, "Bold red.")).toHaveCSS("font-weight", "700");
  await expect(span(page, "Bold red.")).toHaveCSS("color", "rgb(204, 0, 0)");
  await expect(span(page, "Normal text.")).toHaveCSS("font-weight", "400");
  await expect(span(page, "Italic blue.")).toHaveCSS("font-style", "italic");
  await expect(span(page, "Both styles.")).toHaveCSS("font-weight", "700");
  await expect(span(page, "Both styles.")).toHaveCSS("font-style", "italic");
  await expect(span(page, "Underline")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await expect(span(page, "Strike")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(span(page, "Double decoration.")).toHaveCSS(
    "text-decoration-line",
    "underline line-through",
  );
  await expect(span(page, "Annotation under.")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await expect(span(page, "Annotation strike.")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(span(page, "Red")).toHaveCSS("color", "rgb(204, 0, 0)");
  await expect(span(page, "Blue.")).toHaveCSS("color", "rgb(0, 0, 204)");
  await expect(span(page, "Slanted.")).toHaveCSS("font-style", "italic");
  await expect(span(page, "Cell bold")).toHaveCSS("font-weight", "700");
  await expect(span(page, "Cell italic")).toHaveCSS("font-style", "italic");
  await expect(
    page.getByRole("button", { name: "Styled link.", exact: true }),
  ).toHaveCSS("font-style", "italic");
}
test("PDF font/color and partial decorations survive both text modes, tables, annotation markup and links", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await checkStyles(page);
  await expect(span(page, "plain")).not.toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await checkStyles(page);
  await page.getByRole("button", { name: "본문 검색", exact: true }).click();
  await page.getByLabel("본문 검색어").fill("RedBlue");
  await expect(page.locator(".result-list button")).toHaveCount(1);
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await span(page, "Bold red.").evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await page.getByLabel("주석 내용").fill("Keep this emphasis");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(span(page, "Bold red.").locator("mark")).toContainText(
    "Bold red.",
  );
  await expect(span(page, "Bold red.")).toHaveCSS("font-weight", "700");
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  await checkStyles(page);
  await page.getByRole("button", { name: "Styled link.", exact: true }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  expect(errors).toEqual([]);
});
test("source colors remain legible in all five themes and font settings still work", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  for (const name of ["화이트", "다크", "샌드", "세이지", "미스트"]) {
    await page
      .getByRole("button", { name: `${name} 테마`, exact: true })
      .click();
    for (const text of [
      "Bold red.",
      "Italic blue.",
      "Pale yellow.",
      "Normal text.",
    ]) {
      const result = await span(page, text).evaluate((el) => ({
        ink: getComputedStyle(el).color,
        bg: getComputedStyle(document.querySelector(".reader"))
          .getPropertyValue("--read-bg")
          .trim(),
      }));
      const parts = result.ink.match(/\d+/g).slice(0, 3).map(Number);
      const color =
        "#" + parts.map((n) => n.toString(16).padStart(2, "0")).join("");
      expect(colorContrast(color, result.bg)).toBeGreaterThanOrEqual(4.49);
    }
  }
  await page.getByLabel("글자 크기", { exact: true }).fill("25");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".flow-prose")).toHaveCSS("font-size", "25px");
  await expect(span(page, "Both styles.")).toHaveCSS("font-style", "italic");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.screenshot({ path: "/tmp/pdf-style-dark.png" });
});
