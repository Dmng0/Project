import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
test.use({ hasTouch: true });
async function pdf(name) {
  const d = await PDFDocument.create(),
    f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([420, 600]).drawText(name, { x: 30, y: 420, size: 16, font: f });
  return {
    name: name + ".pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await d.save()),
  };
}
async function setup(page) {
  await page.goto("/");
  await expect(page.getByText("아직 비어 있는 책장")).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles(await Promise.all(["A", "B", "C", "Outside"].map(pdf)));
  await expect(page.locator(".book-card")).toHaveCount(4);
}
async function makeFolder(page, name, ids) {
  await page.getByRole("button", { name: "새 시리즈 만들기" }).click();
  await page.getByLabel("시리즈 이름").fill(name);
  for (const id of ids) await page.getByLabel(id, { exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
}
async function folder(page, name) {
  await page.locator(".folder-nav-row .nav").filter({ hasText: name }).click();
}
const titles = (page) => page.locator(".book-info h3");
async function pointerDrag(page, source, target) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(),
    to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 14,
  });
  await page.mouse.up();
}

test("drag book order persists and continuous reading follows the folder order", async ({
  page,
}) => {
  await setup(page);
  await makeFolder(page, "Folder A", ["A", "B", "C"]);
  await folder(page, "Folder A");
  await expect(titles(page)).toHaveText(["A", "B", "C"]);
  await pointerDrag(
    page,
    page.getByRole("button", { name: "C 순서 변경", exact: true }),
    page.locator(".book-card").first(),
  );
  await expect(titles(page)).toHaveText(["C", "A", "B"]);
  await expect(page.getByLabel("책 정렬")).toHaveValue("manual");
  await page.reload();
  await folder(page, "Folder A");
  await expect(titles(page)).toHaveText(["C", "A", "B"]);
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await page.getByRole("button", { name: "B 순서 변경", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".book-card.dragging")).toHaveCount(1);
  // Wait for DnD's initial collision measurement before sending movement keys.
  await expect(
    page.locator('[id^="DndLiveRegion-"]').filter({ hasText: "B 위치로 이동" }),
  ).toHaveCount(1);
  // KeyboardSensor installs its key listener after the activation event.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("ArrowUp");
  await expect(
    page.locator('[id^="DndLiveRegion-"]').filter({ hasText: "A 위치로 이동" }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.locator(".book-card.dragging")).toHaveCount(0);
  await expect(titles(page)).toHaveText(["C", "B", "A"]);
  await page.getByRole("button", { name: "C", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("switch", { name: "연속 보기", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.locator(".reading-scroll").click({ position: { x: 360, y: 350 } });
  await expect(page.locator(".reader-top h1")).toHaveText("B");
});

test("folder editing adds existing/new PDFs, removes files and retains reading metadata", async ({
  page,
}) => {
  await setup(page);
  await makeFolder(page, "Folder A", ["A", "B"]);
  await makeFolder(page, "Folder B", ["C"]);
  await folder(page, "Folder A");
  await page.getByRole("button", { name: "A", exact: true }).click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.getByRole("button", { name: "북마크", exact: true }).click();
  await page.getByRole("button", { name: "현재 페이지 북마크 추가" }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.getByRole("button", { name: "폴더 편집", exact: true }).click();
  await page.getByLabel("A", { exact: true }).uncheck();
  await page.getByLabel("C", { exact: true }).check();
  await page.getByRole("button", { name: "폴더 저장", exact: true }).click();
  await expect(titles(page)).toHaveText(["B", "C"]);
  await page.getByRole("button", { name: "모든 책" }).click();
  await expect(page.locator(".book-card")).toHaveCount(4);
  await page.getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "북마크", exact: true }).click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await folder(page, "Folder A");
  await page.locator("input[type=file]").setInputFiles(await pdf("New"));
  await expect(titles(page)).toHaveText(["B", "C", "New"]);
  await page.getByRole("button", { name: "New 관리" }).click();
  await page
    .getByRole("button", { name: "폴더에서 제외", exact: true })
    .click();
  await expect(titles(page)).toHaveText(["B", "C"]);
  await page.getByRole("button", { name: "폴더 편집", exact: true }).click();
  await page.getByLabel("B", { exact: true }).uncheck();
  await page.getByLabel("C", { exact: true }).uncheck();
  await page.getByRole("button", { name: "폴더 저장", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(5);
  await expect(page.locator(".folder-nav-row")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(5);
});

test("folder drag order persists, favorite books stay pinned, narrow lists do not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup(page);
  await makeFolder(page, "Folder A", ["A", "B"]);
  await makeFolder(page, "Folder B", ["C"]);
  await pointerDrag(
    page,
    page.getByRole("button", { name: "Folder B 폴더 순서 변경", exact: true }),
    page.locator(".folder-nav-row").first(),
  );
  await expect(page.locator(".series-name")).toHaveText([
    "Folder B",
    "Folder A",
  ]);
  await page.reload();
  await expect(page.locator(".series-name")).toHaveText([
    "Folder B",
    "Folder A",
  ]);
  await folder(page, "Folder A");
  await page
    .locator(".book-card")
    .first()
    .getByRole("button", { name: "즐겨찾기 추가" })
    .click();
  await pointerDrag(
    page,
    page.getByRole("button", { name: "B 순서 변경", exact: true }),
    page.locator(".book-card").first(),
  );
  await expect(titles(page)).toHaveText(["A", "B"]);
  await expect(page.locator(".toast")).toContainText("즐겨찾기는 항상");
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/folder-sort-mobile.png",
    fullPage: true,
  });
});

test("touch drag handles reorder PDF books without opening the reader", async ({
  page,
}) => {
  await setup(page);
  await makeFolder(page, "Touch folder", ["A", "B", "C"]);
  await folder(page, "Touch folder");
  const source = page.getByRole("button", { name: "C 순서 변경", exact: true });
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(),
    to = await page.locator(".book-card").first().boundingBox();
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2,
    tx = to.x + to.width / 2,
    ty = to.y + to.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 15; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + ((tx - x) * i) / 15, y: y + ((ty - y) * i) / 15 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(titles(page)).toHaveText(["C", "A", "B"]);
  await expect(page.locator(".reader")).toHaveCount(0);
  await cdp.detach();
});
