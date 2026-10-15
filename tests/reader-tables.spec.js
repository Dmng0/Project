import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
async function tablePdf() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([600, 800]);
  p.drawText("Before the table.", { x: 40, y: 690, size: 14, font });
  const rows = [
    ["Item", "Count", "Price"],
    ["Apple", "2", "100"],
    ["Pear", "3", "200"],
  ];
  rows.forEach((row, r) =>
    row.forEach((text, c) =>
      p.drawText(text, { x: 50 + c * 170, y: 600 - r * 30, size: 12, font }),
    ),
  );
  for (let r = 0; r <= 3; r++)
    p.drawLine({
      start: { x: 40, y: 622 - r * 30 },
      end: { x: 550, y: 622 - r * 30 },
      thickness: 1,
    });
  for (let c = 0; c <= 3; c++)
    p.drawLine({
      start: { x: 40 + c * 170, y: 622 },
      end: { x: 40 + c * 170, y: 532 },
      thickness: 1,
    });
  p.drawText("After the table.", { x: 40, y: 480, size: 14, font });
  pdf
    .addPage([600, 800])
    .drawText("The next page.", { x: 40, y: 600, size: 14, font });
  return {
    name: "Tables.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
}
async function open(page) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(await tablePdf());
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("Before the table.");
}
async function closePanel(page) {
  await page.getByRole("button", { name: "패널 닫기" }).click();
}
test("PDF tables keep rows, columns and surrounding prose in paged and continuous reading", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "yeobaek-settings",
      JSON.stringify({ bars: false, cropTop: 15, cropBottom: 15 }),
    ),
  );
  await open(page);
  await expect(page.locator(".reader")).toHaveClass(/bars-visible/);
  const table = page.getByRole("table", { name: "PDF 표", exact: true });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1).getByRole("cell")).toHaveText([
    "Apple",
    "2",
    "100",
  ]);
  await expect(page.locator(".prose p")).toHaveText([
    "Before the table. ",
    "After the table. ",
  ]);
  await expect(page.getByLabel("현재 페이지와 전체 페이지")).toHaveText(
    "1 / 2",
  );
  await table.getByRole("cell", { name: "200", exact: true }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("1");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await expect(page.getByLabel("원본 상단 가리기")).toHaveCount(0);
  await expect(page.getByLabel("원본 하단 가리기")).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "상단 · 하단바 기본 표시" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await closePanel(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(2).getByRole("cell")).toHaveText([
    "Pear ",
    "3 ",
    "200",
  ]);
  const root = page.locator(".flow-prose");
  await expect(root).toContainText("After the table.");
  await page.getByRole("button", { name: "본문 검색", exact: true }).click();
  await page.getByRole("textbox", { name: "본문 검색어" }).fill("Apple");
  await expect(page.locator(".result-list")).toContainText("1페이지");
  await closePanel(page);
  await table
    .getByRole("cell", { name: "Apple", exact: true })
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await page.getByLabel("주석 내용").fill("A table note");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await closePanel(page);
  await expect(table.locator("mark")).toContainText("Apple");
  await page.getByLabel("페이지 이동").fill("2");
  await expect(page.getByLabel("현재 페이지와 전체 페이지")).toHaveText(
    "2 / 2",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/reader-table.png" });
});

test("note listing does not focus a textbox; composer follows visible area above keyboard", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "주석", exact: true }).click();
  await expect(page.locator(".note-form")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
    "TEXTAREA",
  );
  await closePanel(page);
  await page
    .locator(".prose p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await expect(page.getByLabel("주석 내용")).toBeFocused();
  // Model an Android WebView where only visualViewport shrinks for the IME.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      value: 450,
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  const sheet = page.locator(".bottom-sheet");
  await expect
    .poll(async () =>
      Math.round(
        (await sheet.boundingBox()).y + (await sheet.boundingBox()).height,
      ),
    )
    .toBe(450);
  const body = await page.getByLabel("주석 내용").boundingBox();
  expect(body.y).toBeGreaterThan(0);
  expect(body.y + body.height).toBeLessThanOrEqual(450);
  await page.getByLabel("주석 내용").fill("Visible above keyboard");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
    "TEXTAREA",
  );
  await page.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await closePanel(page);
  await page.locator(".prose mark").click();
  await expect(page.locator(".saved-note")).toContainText(
    "Visible above keyboard",
  );
  await expect(page.locator(".note-form")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
    "TEXTAREA",
  );
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByLabel("주석 내용")).toBeFocused();
  // Also cover Android adjustResize, which shrinks the layout viewport too.
  await page.setViewportSize({ width: 390, height: 450 });
  await expect
    .poll(async () =>
      Math.round(
        (await sheet.boundingBox()).y + (await sheet.boundingBox()).height,
      ),
    )
    .toBe(450);
  const resized = await page.getByLabel("주석 내용").boundingBox();
  expect(resized.y + resized.height).toBeLessThanOrEqual(450);
});
