// PDF.js 6 exposes painting operations separately from extracted text. Walk
// graphics/text state once, then match painted glyphs to text by font/position.
const identity = () => [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const point = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const hexColor = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;
export function fontFormat(font = {}, matrix = identity(), render = 0) {
  const name = font.name || "";
  const shear =
    Math.abs(matrix[0] * matrix[2] + matrix[1] * matrix[3]) /
    (Math.hypot(matrix[0], matrix[1]) * Math.hypot(matrix[2], matrix[3]) || 1);
  return {
    bold: !!(
      font.bold ||
      font.black ||
      /bold|black|heavy|demi|semibold/i.test(name) ||
      (render & 3) === 2
    ),
    italic: !!(font.italic || /italic|oblique/i.test(name) || shear > 0.12),
  };
}
export function collectFormat(operators, OPS, getFont) {
  const names = new Map(
    Object.entries(OPS).map(([key, value]) => [value, key]),
  );
  const glyphs = [],
    rules = [],
    stack = [];
  let s = {
    ctm: identity(),
    tm: identity(),
    x: 0,
    y: 0,
    lx: 0,
    ly: 0,
    font: null,
    size: 0,
    hscale: 1,
    char: 0,
    word: 0,
    leading: 0,
    rise: 0,
    fill: "#000000",
    stroke: "#000000",
    width: 1,
    render: 0,
  };
  const save = () => stack.push({ ...s });
  const restore = () => {
    s = stack.pop() || s;
  };
  const move = (x, y) => {
    s.x = s.lx += x;
    s.y = s.ly += y;
  };
  const draw = (values) => {
    const font = getFont(s.font) || {},
      m = multiply(s.ctm, s.tm);
    const format = {
      ...fontFormat(font, s.tm, s.render),
      color: (s.render & 3) === 1 ? s.stroke : s.fill,
    };
    for (const g of values || []) {
      if (typeof g === "number") {
        s.x -= (g * s.size * s.hscale) / 1000;
        continue;
      }
      if (!g || !g.unicode) continue;
      const width = g.width * s.size * (font.fontMatrix?.[0] || 0.001);
      const start = point(m, s.x, s.y + s.rise),
        end = point(m, s.x + width * s.hscale, s.y + s.rise);
      // NFKC aligns ligatures with PDF.js's normalized TextContent strings.
      const chars = [...g.unicode.normalize("NFKC")];
      for (let i = 0; i < chars.length; i++)
        glyphs.push({
          char: chars[i],
          font: s.font,
          x: start[0] + ((end[0] - start[0]) * i) / chars.length,
          y: start[1] + ((end[1] - start[1]) * i) / chars.length,
          width: Math.abs(end[0] - start[0]) / chars.length,
          height: Math.abs(s.size) * Math.hypot(m[2], m[3]),
          format,
        });
      s.x += (width + s.char + (g.isSpace ? s.word : 0)) * s.hscale;
    }
  };
  const rule = (a, b, color, thickness) => {
    const p = point(s.ctm, ...a),
      q = point(s.ctm, ...b);
    if (Math.abs(p[1] - q[1]) <= 0.6 && Math.abs(p[0] - q[0]) > 1)
      rules.push({
        x0: Math.min(p[0], q[0]),
        x1: Math.max(p[0], q[0]),
        y: (p[1] + q[1]) / 2,
        color,
        thickness,
      });
  };
  let annotationDepth = 0;
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = names.get(operators.fnArray[i]),
      a = operators.argsArray[i] || [];
    if (op === "beginAnnotation") {
      annotationDepth++;
      continue;
    }
    if (op === "endAnnotation") {
      annotationDepth = Math.max(0, annotationDepth - 1);
      continue;
    }
    if (annotationDepth) continue;
    switch (op) {
      case "save":
        save();
        break;
      case "restore":
        restore();
        break;
      case "transform":
        s.ctm = multiply(s.ctm, a.length === 1 ? a[0] : a);
        break;
      case "paintFormXObjectBegin":
        save();
        if (a[0]) s.ctm = multiply(s.ctm, a[0]);
        break;
      case "paintFormXObjectEnd":
        restore();
        break;
      case "beginText":
        s.tm = identity();
        s.x = s.y = s.lx = s.ly = 0;
        break;
      case "setFont":
        [s.font, s.size] = a;
        break;
      case "setTextMatrix":
        s.tm = Array.from(a.length === 1 ? a[0] : a);
        s.x = s.y = s.lx = s.ly = 0;
        break;
      case "moveText":
        move(a[0], a[1]);
        break;
      case "setLeadingMoveText":
        s.leading = a[1];
        move(a[0], a[1]);
        break;
      case "setLeading":
        s.leading = -a[0];
        break;
      case "nextLine":
        move(0, s.leading);
        break;
      case "setCharSpacing":
        s.char = a[0];
        break;
      case "setWordSpacing":
        s.word = a[0];
        break;
      case "setHScale":
        s.hscale = a[0] / 100;
        break;
      case "setTextRise":
        s.rise = a[0];
        break;
      case "setTextRenderingMode":
        s.render = a[0];
        break;
      case "setFillRGBColor":
        s.fill = hexColor(a[0]);
        break;
      case "setStrokeRGBColor":
        s.stroke = hexColor(a[0]);
        break;
      case "setFillColorN":
      case "setFillTransparent":
        s.fill = null;
        break;
      case "setStrokeColorN":
      case "setStrokeTransparent":
        s.stroke = null;
        break;
      case "setLineWidth":
        s.width = a[0];
        break;
      case "setGState":
        for (const [key, value] of a[0] || []) {
          if (key === "Font") [s.font, s.size] = value;
          if (key === "LW") s.width = value;
        }
        break;
      case "showText":
      case "showSpacedText":
        draw(a[0]);
        break;
      case "nextLineShowText":
        move(0, s.leading);
        draw(a[0]);
        break;
      case "nextLineSetSpacingShowText":
        s.word = a[0];
        s.char = a[1];
        move(0, s.leading);
        draw(a[2]);
        break;
      case "constructPath": {
        const paint = names.get(a[0]),
          data = a[1]?.[0],
          bounds = a[2];
        const stroke = /stroke/i.test(paint || ""),
          fill = /fill/i.test(paint || "");
        if (!stroke && !fill) break; // Clipping paths do not paint decorations.
        const scale = Math.max(
          Math.hypot(s.ctm[0], s.ctm[1]),
          Math.hypot(s.ctm[2], s.ctm[3]),
        );
        if (stroke && ArrayBuffer.isView(data)) {
          let last = null,
            first = null;
          for (let j = 0; j < data.length; ) {
            const command = data[j++];
            if (command === 0) {
              last = [data[j++], data[j++]];
              first = last;
            } else if (command === 1) {
              const next = [data[j++], data[j++]];
              if (last) rule(last, next, s.stroke, s.width * scale);
              last = next;
            } else if (command === 2) {
              j += 4;
              last = [data[j++], data[j++]];
            } else if (command === 3) {
              j += 2;
              last = [data[j++], data[j++]];
            } else if (command === 4) {
              if (last && first) rule(last, first, s.stroke, s.width * scale);
              last = first;
            } else break;
          }
        }
        // Many producers paint underline/strike as a thin filled rectangle.
        if (
          fill &&
          bounds &&
          bounds[3] - bounds[1] > 0 &&
          bounds[3] - bounds[1] <= 3
        )
          rule(
            [bounds[0], (bounds[1] + bounds[3]) / 2],
            [bounds[2], (bounds[1] + bounds[3]) / 2],
            s.fill,
            (bounds[3] - bounds[1]) * scale,
          );
        break;
      }
    }
  }
  return { glyphs, rules };
}
function annotationsAt(annotations, x, y, w, h) {
  const result = {};
  for (const a of annotations) {
    if (!["Underline", "StrikeOut"].includes(a.subtype)) continue;
    const boxes = [];
    if (a.quadPoints?.length)
      for (let i = 0; i < a.quadPoints.length; i += 8) {
        const q = Array.from(a.quadPoints.slice(i, i + 8));
        boxes.push([
          Math.min(q[0], q[2], q[4], q[6]),
          Math.min(q[1], q[3], q[5], q[7]),
          Math.max(q[0], q[2], q[4], q[6]),
          Math.max(q[1], q[3], q[5], q[7]),
        ]);
      }
    if (!boxes.length && a.rect) boxes.push(a.rect);
    if (
      boxes.some(
        (r) =>
          x + w / 2 >= r[0] &&
          x + w / 2 <= r[2] &&
          y + h * 0.35 >= r[1] &&
          y + h * 0.35 <= r[3],
      )
    ) {
      result[a.subtype === "Underline" ? "underline" : "strike"] = true;
      if (a.color?.length === 3)
        result.decorationColor =
          "#" +
          Array.from(a.color, (v) =>
            Math.round(v).toString(16).padStart(2, "0"),
          ).join("");
    }
  }
  return result;
}
export function formatTextItems(items, painting, getFont, annotations = []) {
  const buckets = new Map();
  for (const g of painting.glyphs) {
    const key = `${g.font}:${Math.round(g.y / 3)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }
  const used = new Set();
  return items.map((item) => {
    if (!item.str) return item;
    const [, , , , x, y] = item.transform,
      h =
        Math.abs(item.height) ||
        Math.hypot(item.transform[2], item.transform[3]);
    const axis = Math.hypot(item.transform[0], item.transform[1]) || 1;
    const ux = item.transform[0] / axis,
      uy = item.transform[1] / axis;
    const endY = y + item.width * uy,
      tolerance = Math.max(2, h * 0.25),
      candidates = [];
    const along = (g) => (g.x - x) * ux + (g.y - y) * uy;
    for (
      let b = Math.floor((Math.min(y, endY) - tolerance) / 3) - 1;
      b <= Math.ceil((Math.max(y, endY) + tolerance) / 3) + 1;
      b++
    )
      candidates.push(...(buckets.get(`${item.fontName}:${b}`) || []));
    const available = candidates
      .filter(
        (g) =>
          !used.has(g) &&
          Math.abs((g.x - x) * uy - (g.y - y) * ux) <= tolerance &&
          along(g) >= -1 &&
          along(g) <= item.width + 1,
      )
      .sort((a, b) =>
        item.dir === "rtl" ? along(b) - along(a) : along(a) - along(b),
      );
    let cursor = 0,
      index = 0;
    const runs = [];
    for (const char of item.str) {
      const end = index + char.length;
      let found = -1;
      for (let j = cursor; j < Math.min(available.length, cursor + 16); j++)
        if (available[j].char === char) {
          found = j;
          break;
        }
      const g = found >= 0 ? available[found] : null;
      if (g) {
        cursor = found + 1;
        used.add(g);
      }
      const gx = g?.x ?? x + (item.width * index) / item.str.length,
        gy = g?.y ?? y,
        width = g?.width ?? (item.width * char.length) / item.str.length;
      const format = {
        ...(g?.format || {
          ...fontFormat(getFont(item.fontName), item.transform),
          color:
            available[cursor]?.format.color ||
            available[cursor - 1]?.format.color ||
            null,
        }),
        ...annotationsAt(annotations, gx, gy, width, h),
      };
      for (const r of painting.rules) {
        if (
          r.thickness > Math.max(2, h * 0.16) ||
          Math.min(gx + width, r.x1) - Math.max(gx, r.x0) < width * 0.45
        )
          continue;
        const dy = (r.y - gy) / h;
        if (dy >= -0.28 && dy <= 0.08) {
          format.underline = true;
          format.decorationColor = r.color;
        }
        if (dy >= 0.18 && dy <= 0.55) {
          format.strike = true;
          format.decorationColor = r.color;
        }
      }
      const last = runs.at(-1),
        key = JSON.stringify(format);
      if (last && last.key === key) {
        last.end = end;
        last.width = Math.max(last.width, gx + width - last.x);
      } else runs.push({ start: index, end, format, key, x: gx, width });
      index = end;
    }
    return { ...item, formatRuns: runs };
  });
}
const rgb = (color) =>
  hexColor(color)
    ?.slice(1)
    .match(/../g)
    .map((c) => parseInt(c, 16));
const luminance = (c) =>
  c
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export function colorContrast(a, b) {
  const x = luminance(rgb(a)),
    y = luminance(rgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableColor(color, background, ink) {
  const c = rgb(color);
  if (!c) return ink;
  if (Math.max(...c) <= 40 && Math.max(...c) - Math.min(...c) <= 10) return ink;
  if (colorContrast(color, background) >= 4.5) return color;
  const target = luminance(rgb(background)) > 0.179 ? 0 : 255;
  let low = 0,
    high = 1,
    answer = ink;
  for (let i = 0; i < 12; i++) {
    const t = (low + high) / 2,
      mixed =
        "#" +
        c
          .map((v) =>
            Math.round(v + (target - v) * t)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
    if (colorContrast(mixed, background) >= 4.5) {
      high = t;
      answer = mixed;
    } else low = t;
  }
  return answer;
}
export function textFormatStyle(format, theme) {
  if (!format) return undefined;
  const color = readableColor(format.color, theme.bg, theme.ink);
  return {
    fontWeight: format.bold ? 700 : 400,
    fontStyle: format.italic ? "italic" : "normal",
    color,
    textDecorationLine:
      [format.underline ? "underline" : "", format.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ") || undefined,
    textDecorationColor: format.decorationColor
      ? readableColor(format.decorationColor, theme.bg, theme.ink)
      : undefined,
  };
}
