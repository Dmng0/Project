import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
async function pdf(name, content) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (const text of content) {
    const p = doc.addPage([420, 600]);
    p.drawText(text, { x: 35, y: 540, size: 16, font });
  }
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  };
}
test("mobile library and reader persist and support series, themes, bookmarks and next book", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles([
      await pdf("Alpha.pdf", [
        "Chapter one. A quiet morning.",
        "Chapter two. The adventure continues.",
      ]),
      await pdf("Beta.pdf", ["Another story begins."]),
    ]);
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page
    .locator(".book-card")
    .last()
    .getByRole("button", { name: "즐겨찾기 추가" })
    .click();
  await expect(page.locator(".book-info h3").first()).toHaveText("Beta");
  await page.getByRole("button", { name: "Beta 관리" }).click();
  await page.getByLabel("책 제목").fill("Beta renamed");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".book-info h3").first()).toHaveText(
    "Beta renamed",
  );
  await page.getByRole("button", { name: "새 시리즈 만들기" }).click();
  await page.getByLabel("시리즈 이름").fill("My series");
  await page.getByLabel("Alpha", { exact: true }).check();
  await page.getByLabel("Beta renamed", { exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".series-badge")).toHaveCount(2);
  await page.getByRole("button", { name: "즐겨찾기 해제" }).click();
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("Chapter one");
  await page.getByRole("button", { name: "본문 검색", exact: true }).click();
  await page.getByLabel("본문 검색어").fill("adventure");
  await page.getByRole("button", { name: /2페이지/ }).click();
  await expect(page.locator(".prose")).toContainText("Chapter two");
  await page.getByRole("button", { name: "북마크", exact: true }).click();
  await page.getByRole("button", { name: "현재 페이지 북마크 추가" }).click();
  await expect(page.locator(".bookmark-row")).toContainText("2페이지");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "세이지 테마" }).click();
  await page.getByRole("switch", { name: "연속 보기" }).click();
  await page.getByLabel("글자 크기", { exact: true }).fill("24");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".prose")).toHaveCSS("font-size", "24px");
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("Chapter two");
  await page.locator(".reading-scroll").click({ position: { x: 350, y: 350 } });
  await expect(page.locator(".prose")).toContainText("Another story");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("button", { name: "PDF 원본" }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".pdf-canvas")).toBeVisible();
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.getByRole("button", { name: "Beta renamed 관리" }).click();
  await page.getByRole("button", { name: "책 삭제" }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/yeobaek-mobile.png", fullPage: true });
});
test("desktop empty shelf has no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/yeobaek-desktop.png", fullPage: true });
});
test("narrow mobile supports swipe, scroll scrubbing and scan fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles(await pdf("Pages.pdf", ["First page", "Second page", ""]));
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("First page");
  await page.locator(".reading-scroll").evaluate((el) => {
    const start = new Touch({
      identifier: 1,
      target: el,
      clientX: 260,
      clientY: 300,
    });
    const end = new Touch({
      identifier: 1,
      target: el,
      clientX: 70,
      clientY: 302,
    });
    el.dispatchEvent(
      new TouchEvent("touchstart", { touches: [start], bubbles: true }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", { changedTouches: [end], bubbles: true }),
    );
  });
  await expect(page.locator(".prose")).toContainText("Second page");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByLabel("페이지 이동").fill("1");
  await expect(page.getByLabel("페이지 이동")).toHaveValue("1");
  await page.getByLabel("페이지 이동").fill("3");
  await expect(page.getByLabel("페이지 이동")).toHaveValue("3");
  await expect(
    page.getByText("텍스트가 없는 페이지는 원본으로 표시합니다."),
  ).toBeVisible();
  await expect
    .poll(() => page.locator(".pdf-canvas").evaluate((c) => c.width))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await expect(
    page.getByRole("switch", { name: "상단 · 하단바 기본 표시" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.locator(".reading-scroll").click({ position: { x: 160, y: 400 } });
  await page.getByRole("button", { name: "읽기 도구 표시" }).click();
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
});
