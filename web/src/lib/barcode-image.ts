import { ean13Modules } from "./barcode";
import { barcodeFit, contentSize, type LabelSetup } from "./label-layout";

// A product's sticker as a PNG image, to download and use elsewhere (another
// label program, WhatsApp, a supplier…), drawn with the same settings as the
// printed sticker. Browser only: drawn on a canvas.

const PX_PER_MM = 16; // ≈ 406 dpi: sharp bars and text.
const PT = 0.3528; // mm per point

export interface StickerText {
  /** Shop name (printed only if ticked in the setup). */
  shop?: string;
  /** Product name. */
  name?: string;
  /** Price text, e.g. "180 درهم" (none = no price line). */
  price?: string;
}

/**
 * The sticker exactly as set in «ضبط الطابعة»: its size, margins, rotation,
 * the ticked lines with their sizes, bold price, space between lines, bar
 * height and digits. (The shift and gap are for the printer, not the image.)
 */
export function stickerCanvas(code: string, s: LabelSetup, text: StickerText): HTMLCanvasElement {
  const px = (mm: number) => mm * PX_PER_MM;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(px(s.w));
  canvas.height = Math.round(px(s.h));
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.textBaseline = "middle";

  // The block inside the margins, turned around its centre.
  const box = { x: px(s.left), y: px(s.top), w: px(s.w - s.left - s.right), h: px(s.h - s.top - s.bottom) };
  const size = contentSize(s);
  const cw = px(size.w);
  g.translate(box.x + box.w / 2, box.y + box.h / 2);
  g.rotate((s.rotate * Math.PI) / 180);

  // The lines, top to bottom, as on the sticker (line height 1.1).
  type Line = { h: number; draw: (top: number) => void };
  const lines: Line[] = [];
  const textLine = (str: string, pt: number, weight: number, maxLines: number, padMm = 0) => {
    const fpx = px(pt * PT);
    g.font = `${weight} ${fpx}px system-ui, sans-serif`;
    const rows = wrap(g, str, cw - px(padMm) * 2, maxLines);
    const lh = fpx * 1.1;
    lines.push({
      h: rows.length * lh,
      draw: (top) => {
        g.font = `${weight} ${fpx}px system-ui, sans-serif`;
        g.direction = "rtl";
        rows.forEach((r, i) => g.fillText(r, 0, top + lh * (i + 0.5)));
      },
    });
  };
  if (s.showShop && text.shop) textLine(text.shop, s.shopSize, 400, 1);
  if (s.showItem && text.name) textLine(text.name, s.itemSize, 500, size.h < 32 ? 1 : 2, 2);
  if (text.price) textLine(text.price, s.priceSize, s.priceBold ? 800 : 400, 1);

  // The barcode: the whole width, bars on the same grid as the printed one.
  const fit = barcodeFit(size.w);
  const mod = cw / fit.width;
  const barsH = px(s.barH);
  const digitsPx = px(6.5 * PT);
  const codeH = barsH + (s.showDigits ? px(0.3) + digitsPx * 1.1 : 0);
  lines.push({
    h: codeH,
    draw: (top) => {
      const m = ean13Modules(code);
      for (let i = 0; i < m.length; i++) if (m[i] === "1") g.fillRect(-cw / 2 + (fit.left + i) * mod, top, mod + 0.3, barsH);
      if (s.showDigits) {
        g.font = `${digitsPx}px ui-monospace, monospace`;
        g.direction = "ltr";
        // Same spacing as the printed digits (0.12em).
        (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${digitsPx * 0.12}px`;
        g.fillText(code, 0, top + barsH + px(0.3) + (digitsPx * 1.1) / 2);
      }
    },
  });

  const gap = px(s.lineGap);
  const total = lines.reduce((t, l) => t + l.h, 0) + gap * (lines.length - 1);
  let y = -total / 2;
  for (const l of lines) {
    l.draw(y);
    y += l.h + gap;
  }
  return canvas;
}

/** Saves the sticker as «<product name>.png» on the device. */
export function downloadStickerPng(code: string, s: LabelSetup, text: StickerText): Promise<void> {
  const name = (text.name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || code;
  return saveCanvas(stickerCanvas(code, s, text), `${name}.png`);
}

/** Splits a text into at most `max` lines that fit `width`; the last one ends with «…» if cut. */
function wrap(g: CanvasRenderingContext2D, s: string, width: number, max: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width <= width || !cur) cur = next;
    else {
      rows.push(cur);
      cur = w;
    }
  }
  if (cur) rows.push(cur);
  if (rows.length <= max) return rows.map((r) => fit(g, r, width));
  const kept = rows.slice(0, max);
  kept[max - 1] = fit(g, `${kept[max - 1]} ${rows.slice(max).join(" ")}`, width);
  return kept;
}

/** Cuts a too long text and ends it with «…». */
function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && g.measureText(out + "…").width > max) out = out.slice(0, -1);
  return out + "…";
}

function saveCanvas(canvas: HTMLCanvasElement, name: string): Promise<void> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("image"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png"),
  );
}
