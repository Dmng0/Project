import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
async function fixture(long = false) {
  const d = await PDFDocument.create(),
    f = await d.embedFont(StandardFonts.Helvetica),
    a = d.addPage([420, 600]),
    b = d.addPage([420, 600]);
  a.drawText("At midnight the story", { x: 35, y: 420, size: 16, font: f });
  a.drawText("continued", { x: 35, y: 402, size: 16, font: f });
  b.drawText("through the night.", { x: 35, y: 500, size: 16, font: f });
  b.drawText("A new paragraph begins.", { x: 35, y: 450, size: 16, font: f });
  a.drawText("1", { x: 205, y: 20, size: 12, font: f });
  b.drawText("2", { x: 205, y: 20, size: 12, font: f });
  if (long) {
    for (let i = 0; i < 18; i++) {
      a.drawText("Earlier sentence " + i + ".", {
        x: 35,
        y: 380 - i * 18,
        size: 12,
        font: f,
      });
      b.drawText("Later sentence " + i + ".", {
        x: 35,
        y: 420 - i * 18,
        size: 12,
        font: f,
      });
    }
    a.drawText("Jump to second", { x: 35, y: 550, size: 16, font: f });
    const link = d.context.register(
      d.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [30, 545, 180, 575],
        Border: [0, 0, 0],
        Dest: [b.ref, "Fit"],
      }),
    );
    a.node.set(PDFName.of("Annots"), d.context.obj([link]));
  }
  return {
    name: "Novel.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await d.save()),
  };
}
async function open(page, long = false) {
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(await fixture(long));
  await page.getByRole("button", { name: "Novel", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
}
async function settings(page) {
  await page.getByRole("button", { name: "읽기 설정" }).click();
}
async function close(page) {
  await page.getByRole("button", { name: "패널 닫기" }).click();
}
async function scrollMode(page) {
  await settings(page);
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await close(page);
  await expect(page.locator(".reading-flow")).toBeVisible();
}

test("scroll text is one novel with no page-sized gaps, while paged and original views remain separate", async ({
  page,
}) => {
  await open(page);
  await scrollMode(page);
  await expect(page.locator(".flow-prose p")).toHaveCount(2);
  await expect(page.locator(".flow-prose p").first()).toHaveText(
    "At midnight the story continued through the night.",
  );
  await expect(page.locator(".reading-page")).toHaveCount(0);
  const box = await page.locator(".reading-flow").boundingBox();
  expect(box.height).toBeLessThan(350);
  await page.getByLabel("페이지 이동").fill("2");
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  await page.getByRole("button", { name: "본문 검색", exact: true }).click();
  await page.getByLabel("본문 검색어").fill("continued through");
  await expect(page.locator(".result-list button")).toHaveCount(1);
  await page.locator(".result-list button").click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("1");
  await settings(page);
  await page.getByRole("button", { name: "좌우 넘김", exact: true }).click();
  await close(page);
  await expect(page.locator(".reading-page")).toHaveCount(1);
  await expect(page.locator(".prose")).not.toContainText("through the night");
  await page.getByLabel("페이지 이동").fill("2");
  await expect(page.locator(".prose")).toContainText("through the night");
  await settings(page);
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("button", { name: "PDF 원본", exact: true }).click();
  await close(page);
  await expect(page.locator(".reading-page")).toHaveCount(2);
  await expect(page.locator(".reading-flow")).toHaveCount(0);
});

test("a note can span a PDF page boundary and remains highlighted after reopening", async ({
  page,
}) => {
  await open(page);
  await scrollMode(page);
  await page
    .locator(".flow-prose p")
    .first()
    .evaluate((p) => {
      const spans = p.querySelectorAll(".flow-source"),
        r = document.createRange();
      r.setStart(spans[0].firstChild, 0);
      const end = spans[spans.length - 1].firstChild;
      r.setEnd(end, end.textContent.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await expect(page.getByLabel("인용 문장")).toHaveValue(
    "At midnight the story continued through the night.",
  );
  await page.getByLabel("주석 내용").fill("This crosses the original pages.");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await close(page);
  await expect(page.locator('.flow-source[data-page="1"] mark')).toHaveCount(2);
  await expect(page.locator('.flow-source[data-page="2"] mark')).toHaveCount(1);
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Novel", exact: true }).click();
  await expect(page.locator('.flow-source[data-page="2"] mark')).toHaveCount(1);
  await page.getByRole("button", { name: "주석", exact: true }).click();
  await expect(page.locator(".saved-note")).toContainText("This crosses");
  await close(page);
  await page.screenshot({ path: "/tmp/continuous-novel-mobile.png" });
  await settings(page);
  await page.getByRole("button", { name: "좌우 넘김", exact: true }).click();
  await close(page);
  await page.getByLabel("페이지 이동").fill("1");
  await expect(page.locator(".prose mark")).toHaveCount(2);
  await page.getByLabel("페이지 이동").fill("2");
  await expect(page.locator(".prose mark")).toHaveCount(1);
});

test("page-based notes, bookmarks, TOC links and restored positions still work in reflow mode", async ({
  page,
}) => {
  await open(page, true);
  await page.getByLabel("페이지 이동").fill("2");
  await page
    .locator(".prose p")
    .first()
    .evaluate((p) => {
      const r = document.createRange();
      r.selectNodeContents(p);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await page.getByLabel("주석 내용").fill("Existing page note");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await close(page);
  await scrollMode(page);
  await expect(
    page.locator('.flow-source[data-page="2"] mark').first(),
  ).toHaveText("through the night.");
  await page.getByLabel("페이지 이동").fill("1");
  await page
    .getByRole("button", { name: "Jump to second", exact: true })
    .click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  await page.getByRole("button", { name: "북마크", exact: true }).click();
  await page.getByRole("button", { name: "현재 페이지 북마크 추가" }).click();
  await close(page);
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Novel", exact: true }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("2");
  await expect
    .poll(async () => {
      const r = await page
        .locator('.flow-source[data-page="2"]')
        .first()
        .boundingBox();
      return Math.round(r.y);
    })
    .toBeLessThan(140);
  await page.getByRole("button", { name: "북마크", exact: true }).click();
  await expect(page.locator(".bookmark-row")).toContainText("2페이지");
});
