export function marginPageNumber(item, height) {
  const y = item.transform?.[5] ?? height / 2;
  return (
    (y < height * 0.1 || y > height * 0.9) &&
    /^\s*[-–—·•(\[]?\s*(?:(?:page|p\.?|제)\s*)?\d{1,5}(?:\s*[/／]\s*\d{1,5})?\s*(?:쪽|페이지)?\s*[-–—·•)\]]?\s*$/i.test(
      item.str || "",
    )
  );
}
export function safeLink(url) {
  try {
    const u = new URL(url);
    return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function viewportRectangle(viewport, rect) {
  const a = viewport.convertToViewportPoint(rect[0], rect[1]),
    b = viewport.convertToViewportPoint(rect[2], rect[3]);
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
}
export function itemRectangle(item, viewport) {
  const x = item.transform[4],
    y = item.transform[5],
    h =
      Math.abs(item.height) || Math.hypot(item.transform[2], item.transform[3]);
  const r = viewportRectangle(viewport, [x, y, x + item.width, y + h]);
  return [
    Math.min(r[0], r[2]),
    Math.min(r[1], r[3]),
    Math.max(r[0], r[2]),
    Math.max(r[1], r[3]),
  ];
}
export function pdfLines(items, annotations, height) {
  const lines = [];
  let parts = [],
    lastY = null;
  const flush = () => {
    if (parts.some((p) => p.text.trim())) lines.push(parts);
    parts = [];
  };
  for (const item of items) {
    if (!("str" in item)) continue;
    if (marginPageNumber(item, height)) continue;
    const y = item.transform[5],
      x = item.transform[4],
      h =
        Math.abs(item.height) ||
        Math.hypot(item.transform[2], item.transform[3]);
    if (lastY !== null && Math.abs(y - lastY) > 4) flush();
    const link = annotations.find(
      (a) =>
        a.subtype === "Link" &&
        a.rect &&
        (a.dest || safeLink(a.url)) &&
        x + item.width > a.rect[0] &&
        x < a.rect[2] &&
        y + h > a.rect[1] &&
        y < a.rect[3],
    );
    const annotation = annotations.some(
      (a) =>
        ["Link", "Text", "Popup", "FreeText", "Widget"].includes(a.subtype) &&
        a.rect &&
        x + item.width > a.rect[0] &&
        x < a.rect[2] &&
        y + h > a.rect[1] &&
        y < a.rect[3],
    );
    parts.push({
      rawText: item.str,
      annotation,
      text: item.str + (item.hasEOL ? "" : " "),
      x,
      y,
      width: item.width,
      fontSize: Math.hypot(item.transform[2], item.transform[3]) || h,
      link: link ? { dest: link.dest, url: safeLink(link.url) } : null,
    });
    lastY = y;
    if (item.hasEOL) {
      flush();
      lastY = null;
    }
  }
  flush();
  return lines;
}

// Match quotations across PDF line breaks without changing the displayed text.
export function quotationRanges(text, notes) {
  let normalized = "",
    map = [],
    space = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (normalized && !space) {
        normalized += " ";
        map.push(i);
      }
      space = true;
    } else {
      normalized += text[i];
      map.push(i);
      space = false;
    }
  }
  return notes
    .flatMap((note) => {
      const quote = note.quote.replace(/\s+/g, " ").trim();
      if (!quote) return [];
      if (
        note.anchorView === "text" &&
        Number.isInteger(note.start) &&
        Number.isInteger(note.end) &&
        text.slice(note.start, note.end).replace(/\s+/g, " ").trim() === quote
      )
        return [{ start: note.start, end: note.end, note }];
      const start = normalized.indexOf(quote);
      if (start < 0) return [];
      return [
        { start: map[start], end: map[start + quote.length - 1] + 1, note },
      ];
    })
    .sort((a, b) => a.start - b.start);
}
