import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";

async function fixture() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const a = pdf.addPage([420, 600]);
  pdf.addPage([420, 600]); // A genuinely empty source page must not become a canvas-sized gap.
  const b = pdf.addPage([420, 600]);
  const draw = (page, text, x, y) =>
    page.drawText(text, { x, y, size: 16, font });
  draw(a, "AYB", 35, 500);
  draw(a, "    ", 35, 470);
  draw(a, "C", 70, 420);
  draw(a, "XY", 35, 380);
  draw(a, "Z", 35, 350);
  draw(b, "D EF.", 35, 500);
  draw(b, "Next sentence.", 35, 450);
  draw(b, "Read next", 35, 400);
  const annotation = (rect, dest) =>
    pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: rect,
        Border: [0, 0, 0],
        Dest: [dest.ref, "Fit"],
      }),
    );
  a.node.set(
    PDFName.of("Annots"),
    pdf.context.obj([annotation([30, 345, 65, 375], b)]),
  );
  b.node.set(
    PDFName.of("Annots"),
    pdf.context.obj([annotation([30, 395, 140, 425], a)]),
  );
  // Model a real PDF ToUnicode map, including damaged annotation glyphs. It
  // exercises PDF.js extraction rather than injecting text into the reader.
  const replacements = {
    A: "생",
    B: "각",
    C: "하",
    D: "고",
    E: "있",
    F: "다",
    X: "\ue000",
    Y: "\ufffd",
    Z: "➜",
  };
  const entries = [];
  for (let code = 32; code < 127; code++) {
    const char =
      replacements[String.fromCharCode(code)] || String.fromCharCode(code);
    entries.push(
      `<${code.toString(16).padStart(2, "0")}> <${char.charCodeAt(0).toString(16).padStart(4, "0")}>`,
    );
  }
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /CleanupTest def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${entries.length} beginbfchar\n${entries.join("\n")}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  await pdf.flush();
  pdf.context
    .lookup(font.ref)
    .set(
      PDFName.of("ToUnicode"),
      pdf.context.register(pdf.context.flateStream(cmap)),
    );
  return {
    name: "Cleanup.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
}
async function open(page) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(await fixture());
  await page.getByRole("button", { name: "Cleanup", exact: true }).click();
  await expect(page.locator(".prose")).toContainText("생각");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "스크롤", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
}
test("Korean fragments join across indentation and a blank PDF page; annotation junk disappears", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator(".flow-prose p")).toHaveCount(3);
  await expect(page.locator(".flow-prose p").first()).toHaveText(
    "생각하고 있다.",
  );
  await expect(page.locator(".flow-prose")).not.toContainText(
    /[\ue000\ufffd➜]/u,
  );
  await expect(page.locator(".reading-flow .pdf-canvas")).toHaveCount(0);
  await expect(page.locator('.flow-source[data-page="2"]')).toHaveCount(1);
  await expect(page.getByLabel("현재 페이지와 전체 페이지")).toHaveText(
    "1 / 3",
  );
  expect(
    (await page.locator(".reading-flow").boundingBox()).height,
  ).toBeLessThan(300);
  await page.getByRole("button", { name: "본문 검색", exact: true }).click();
  await page.getByLabel("본문 검색어").fill("생각하고 있다");
  await expect(page.locator(".result-list button")).toHaveCount(1);
  await page.locator(".result-list button").click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Read next", exact: true }),
  ).toBeVisible();
  await page.getByLabel("페이지 이동").fill("3");
  await page.getByRole("button", { name: "Read next", exact: true }).click();
  await expect(page.getByLabel("페이지 이동")).toHaveValue("1");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/novel-cleanup.png" });
});

test("notes survive cleanup and still highlight the correct fragments in paged text", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".flow-prose p")
    .first()
    .evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "선택한 문장에 주석" }).click();
  await expect(page.getByLabel("인용 문장")).toHaveValue("생각하고 있다.");
  await page.getByLabel("주석 내용").fill("Cleaned cross-page quotation");
  await page.getByRole("button", { name: "주석 저장", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".flow-prose mark")).toHaveCount(4);
  await page.getByRole("button", { name: "책장으로 돌아가기" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Cleanup", exact: true }).click();
  await expect(page.locator(".flow-prose mark")).toHaveCount(4);
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "좌우 넘김", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByLabel("페이지 이동").fill("1");
  await expect(page.locator(".prose mark")).toHaveCount(3);
  await expect(page.locator(".prose")).not.toContainText(/[\ue000\ufffd➜]/u);
  await page.getByLabel("페이지 이동").fill("3");
  await expect(page.locator(".prose mark")).toHaveCount(1);
  await page.getByLabel("페이지 이동").fill("1");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "PDF 원본", exact: true }).click();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".textLayer")).toContainText("\ue000");
});
