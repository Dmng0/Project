import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, PDFName, PDFString } from "pdf-lib";
async function fixture(name, { linked = false, long = false } = {}) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    ps = [doc.addPage([420, 600]), doc.addPage([420, 600])];
  ps.forEach((p, i) => {
    p.drawText(
      i ? "The second chapter begins." : "A quiet morning changes everything.",
      { x: 35, y: 420, size: 16, font },
    );
    p.drawText(String(i + 1), { x: 205, y: 20, size: 12, font });
    if (long)
      for (let n = 0; n < 18; n++)
        p.drawText(`Story paragraph ${i + 1}.${n + 1} continues.`, {
          x: 35,
          y: 390 - n * 18,
          size: 12,
          font,
        });
  });
  if (linked) {
    ps[0].drawText("Next chapter", { x: 35, y: 490, size: 16, font });
    const annot = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [35, 480, 190, 510],
        Border: [0, 0, 0],
        Dest: PDFString.of("ChapterTwo"),
      }),
    );
    ps[0].node.set(PDFName.of("Annots"), doc.context.obj([annot]));
    const dest = doc.context.obj([ps[1].ref, "Fit"]);
    doc.catalog.set(
      PDFName.of("Names"),
      doc.context.obj({ Dests: { Names: [PDFString.of("ChapterTwo"), dest] } }),
    );
    const root = doc.context.register(
      doc.context.obj({ Type: "Outlines", Count: 1 }),
    );
    const item = doc.context.register(
      doc.context.obj({
        Title: PDFString.of("The second chapter"),
        Parent: root,
        Dest: dest,
      }),
    );
    doc.context.lookup(root).set(PDFName.of("First"), item);
    doc.context.lookup(root).set(PDFName.of("Last"), item);
    doc.catalog.set(PDFName.of("Outlines"), root);
  }
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  };
}
async function upload(page, files) {
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.locator(".book-card")).toHaveCount(files.length);
}
async function settings(page) {
  await page.getByRole("button", { name: "읽기 설정" }).click();
}
async function close(page) {
  await page.getByRole("button", { name: "패널 닫기" }).click();
}
async function chooseOriginal(page) {
  await settings(page);
  await page.getByRole("button", { name: "PDF 원본", exact: true }).click();
  await close(page);
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .first()
        .evaluate((c) => c.width),
    )
    .toBeGreaterThan(0);
}

test("hide page chrome and printed numbers; edge taps; named TOC links in both views", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(page, [await fixture("Linked.pdf", { linked: true })]);
  await page.getByRole("button", { name: "Linked", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("A quiet morning");
  await expect(page.locator(".page-kicker,.page-end,.chapter-nav")).toHaveCount(
    0,
  );
  await expect(page.locator(".prose")).not.toContainText(/^1$/);
  await expect(page.locator(".reader-top h1")).toHaveCSS("font-weight", "700");
  await page.locator(".reading-scroll").click({ position: { x: 360, y: 350 } });
  await expect(page.locator(".prose")).toContainText("second chapter");
  await page.locator(".reading-scroll").click({ position: { x: 20, y: 350 } });
  await expect(page.locator(".prose")).toContainText("quiet morning");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  await page.getByLabel("페이지 이동").fill("1");
  await page.getByRole("button", { name: "목차", exact: true }).click();
  await page
    .getByRole("button", { name: "The second chapter", exact: true })
    .click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  await page.getByLabel("페이지 이동").fill("1");
  await chooseOriginal(page);
  await expect(page.getByTestId("pdf-number-mask")).toHaveCount(1);
  await expect(page.locator(".textLayer")).not.toContainText(/^1$/);
  await page.getByRole("button", { name: "목차 링크 1" }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  expect(errors).toEqual([]);
});

test("settings and book sheets start at half height and can be dragged while preview updates", async ({
  page,
}) => {
  await upload(page, [await fixture("Preview.pdf")]);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
  await settings(page);
  const sheet = page.locator(".bottom-sheet");
  await expect
    .poll(() =>
      sheet.evaluate((e) => Math.round(e.getBoundingClientRect().height)),
    )
    .toBe(422);
  await page.getByLabel("글자 크기", { exact: true }).fill("27");
  await expect(page.locator(".prose")).toHaveCSS("font-size", "27px");
  const grip = page.getByRole("slider", { name: "읽기 설정 높이 조절" });
  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 160, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => sheet.evaluate((e) => e.getBoundingClientRect().height))
    .toBeGreaterThan(550);
  await close(page);
  await page.getByRole("button", { name: "다른 PDF 보기" }).click();
  await expect
    .poll(() =>
      sheet.evaluate((e) => Math.round(e.getBoundingClientRect().height)),
    )
    .toBe(422);
  await page
    .getByRole("slider", { name: "다른 책 펼치기 높이 조절" })
    .press("ArrowUp");
  await expect
    .poll(() => sheet.evaluate((e) => e.getBoundingClientRect().height))
    .toBeGreaterThan(450);
  await page.screenshot({ path: "/tmp/reader-resizable.png" });
});

test("select a sentence, create, persist, edit and delete notes", async ({
  page,
}) => {
  await upload(page, [await fixture("Notes.pdf")]);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
  await page
    .locator(".prose p")
    .first()
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await expect(page.getByLabel("인용 문장")).toHaveValue(
    "A quiet morning changes everything.",
  );
  await page.getByLabel("주석 내용").fill("Remember this sentence.");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await expect(page.locator(".saved-note")).toContainText(
    "Remember this sentence.",
  );
  await close(page);
  await expect(page.locator(".prose mark")).toContainText("A quiet morning");
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.locator(".prose mark")).toBeVisible();
  await page.locator(".prose mark").click();
  await page.getByLabel("주석 내용").fill("Edited note.");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await expect(page.locator(".saved-note")).toContainText("Edited note.");
  await page.getByRole("button", { name: "주석 삭제", exact: true }).click();
  await expect(page.locator(".saved-note")).toHaveCount(0);
  await close(page);
  await chooseOriginal(page);
  await expect(page.locator(".textLayer span").first()).toBeAttached();
  await page
    .locator(".textLayer span")
    .first()
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await expect(
    page.getByRole("button", { name: "선택한 문장에 주석" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await page.getByLabel("주석 내용").fill("Original-view note.");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await close(page);
  await expect(page.locator(".textLayer span[data-note-id]")).toHaveCount(1);
});

test("three shelf columns and long list titles stay within narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const title = "VeryLongUnbrokenBookTitle".repeat(8);
  await upload(page, [
    await fixture(title + ".pdf"),
    await fixture("Second.pdf"),
    await fixture("Third.pdf"),
  ]);
  const cols = await page
    .locator(".book-grid")
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(3);
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  const info = await page.locator(".book-info h3").first().boundingBox();
  expect(info.height).toBeGreaterThan(25);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const card of await page.locator(".book-card").all()) {
    const b = await card.boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(321);
  }
  await page.screenshot({
    path: "/tmp/reader-list-mobile.png",
    fullPage: true,
  });
});

test("folder-scoped next book and scroll continuation; other books are grouped", async ({
  page,
}) => {
  await upload(page, [
    await fixture("A1.pdf", { long: true }),
    await fixture("Outside.pdf"),
    await fixture("A2.pdf", { long: true }),
  ]);
  await page.getByRole("button", { name: "새 시리즈 만들기" }).click();
  await page.getByLabel("시리즈 이름").fill("Folder A");
  await page.getByLabel("A1", { exact: true }).check();
  await page.getByLabel("A2", { exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: /Folder A/ })
    .first()
    .click();
  await page.getByRole("button", { name: "A1", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.getByRole("button", { name: "다른 PDF 보기" }).click();
  await expect(page.locator(".book-folder h3")).toHaveText("Folder A");
  await expect(page.locator(".other-book")).toHaveCount(2);
  await expect(page.locator(".grouped-books")).not.toContainText("Outside");
  await close(page);
  await settings(page);
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("switch", { name: "연속 보기", exact: true }).click();
  await close(page);
  await expect(page.locator(".reading-page")).toHaveCount(2);
  // Loading/resuming at the end alone must not advance; user scrolling does.
  await page.getByLabel("페이지 이동").fill("2");
  await page
    .locator(".reading-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator(".reader-top h1")).toHaveText("A1");
  await page.locator(".reading-scroll").dispatchEvent("wheel", { deltaY: 150 });
  await expect(page.locator(".reader-top h1")).toHaveText("A2");
  await expect(page.locator(".reading-page")).toHaveCount(2);
  await page
    .locator(".reading-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.locator(".reading-scroll").evaluate((el) => {
    const start = new Touch({
        identifier: 1,
        target: el,
        clientX: 180,
        clientY: 600,
      }),
      end = new Touch({
        identifier: 1,
        target: el,
        clientX: 180,
        clientY: 300,
      });
    el.dispatchEvent(
      new TouchEvent("touchstart", { touches: [start], bubbles: true }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", { changedTouches: [end], bubbles: true }),
    );
  });
  await expect(page.getByRole("status")).toContainText("이 폴더의 마지막 책");
  await expect(page.locator(".reader-top h1")).toHaveText("A2");
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.getByRole("button", { name: "모든 책" }).click();
  await page.getByRole("button", { name: "Outside", exact: true }).click();
  await page.getByRole("button", { name: "다른 PDF 보기" }).click();
  await expect(page.locator(".book-folder")).toHaveCount(2);
  await expect(page.locator(".grouped-books")).toContainText("묶음 없는 책");
});
