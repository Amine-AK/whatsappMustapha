/**
 * Where each barcode sticker goes on the paper, in millimetres.
 *
 * A roll of stickers has a label of w × h mm, then a gap, then the next label.
 * A label printer finds the gaps by itself; a normal 80 mm receipt printer
 * does not, so we place every sticker ourselves at exactly (h + gap) mm from
 * the previous one. If the gap is a little off, every sticker drifts a bit
 * more than the one before: that is fixed by changing `gap` in 0.1 mm steps.
 */

export type Rotation = 0 | 90 | 180 | 270;
/** "strip": all stickers on one long page (receipt printers). "pages": one page per sticker (label printers). */
export type FeedMode = "strip" | "pages";

export interface LabelSetup {
  /** Sticker width and height on the roll (mm). */
  w: number;
  h: number;
  /** Empty paper between two stickers (mm). */
  gap: number;
  /** Paper width sent to the printer (mm); 0 = the sticker width (plus the shift to the right). */
  pageW: number;
  /** Empty space inside the sticker: top (header), bottom (footer), left and right (mm). */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Moves the whole sticker right / down (mm). */
  dx: number;
  dy: number;
  /** Turns the text and barcode inside the sticker. */
  rotate: Rotation;
  mode: FeedMode;
  /** Text size, % of normal. */
  font: number;
  showShop: boolean;
  showItem: boolean;
}

/** A normal 80 mm receipt (ticket) printer with a roll of 50 × 40 mm stickers. */
export const RECEIPT_PRINTER: LabelSetup = {
  w: 50,
  h: 40,
  gap: 3,
  pageW: 0,
  top: 1.5,
  bottom: 1,
  left: 0,
  right: 0,
  dx: 0,
  dy: 0,
  rotate: 0,
  mode: "strip",
  font: 100,
  showShop: true,
  showItem: true,
};

/** A label printer (HPRT N41…) that finds the gaps itself. */
export const LABEL_PRINTER: LabelSetup = { ...RECEIPT_PRINTER, gap: 0, mode: "pages" };

export const DEFAULT_SETUP = RECEIPT_PRINTER;

const LIMITS: Record<"w" | "h" | "gap" | "pageW" | "top" | "bottom" | "left" | "right" | "dx" | "dy" | "font", [number, number]> = {
  w: [15, 110],
  h: [10, 150],
  gap: [0, 20],
  pageW: [0, 120],
  top: [0, 30],
  bottom: [0, 30],
  left: [0, 30],
  right: [0, 30],
  dx: [-40, 60],
  dy: [-30, 30],
  font: [50, 200],
};

export function clampField(key: keyof typeof LIMITS, v: unknown): number {
  const [lo, hi] = LIMITS[key];
  const n = Number(v);
  if (!Number.isFinite(n)) return lo > 0 ? DEFAULT_SETUP[key] : 0;
  return Math.round(Math.max(lo, Math.min(hi, n)) * 10) / 10;
}

/** Any saved value (maybe old or broken) → a usable setup. */
export function sanitizeSetup(raw: unknown): LabelSetup {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SETUP };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (r[k] !== undefined) out[k] = clampField(k, r[k]);
  }
  if ([0, 90, 180, 270].includes(r.rotate as number)) out.rotate = r.rotate as Rotation;
  if (r.mode === "strip" || r.mode === "pages") out.mode = r.mode;
  if (typeof r.showShop === "boolean") out.showShop = r.showShop;
  if (typeof r.showItem === "boolean") out.showItem = r.showItem;
  // The margins must leave some room for the sticker's content.
  if (out.left + out.right > out.w - 10) out.left = out.right = 0;
  if (out.top + out.bottom > out.h - 8) out.top = out.bottom = 0;
  return out;
}

/** Distance from the top of one sticker to the top of the next (mm). */
export const pitch = (s: LabelSetup) => round(s.h + s.gap);

/** Width of the paper sent to the printer (mm). */
export const paperWidth = (s: LabelSetup) => round(s.pageW > 0 ? s.pageW : s.w + Math.max(0, s.dx));

/** The area inside the margins, on the paper (mm): before turning. */
export function contentBox(s: LabelSetup) {
  return { x: round(s.dx + s.left), y: round(s.dy + s.top), w: round(s.w - s.left - s.right), h: round(s.h - s.top - s.bottom) };
}

/** Size of the text + barcode block once turned (mm): 90° / 270° swap width and height. */
export function contentSize(s: LabelSetup) {
  const b = contentBox(s);
  const turned = s.rotate === 90 || s.rotate === 270;
  return { w: turned ? b.h : b.w, h: turned ? b.w : b.h };
}

/**
 * How many stickers go on each printed page. Strip mode puts many on one
 * page, but no page longer than ~5 m (the PDF limit is 5.08 m).
 */
export function pageGroups(s: LabelSetup, count: number): number[] {
  if (count <= 0) return [];
  const per = s.mode === "pages" ? 1 : Math.max(1, Math.min(100, Math.floor(5000 / pitch(s))));
  const out: number[] = [];
  for (let left = count; left > 0; left -= per) out.push(Math.min(per, left));
  return out;
}

/**
 * The CSS @page rules: one size for full pages, a named "lbl-last" page for a
 * shorter last page. The page is exactly N × (h + gap) long, so the next print
 * starts on the next sticker.
 */
export function pageCss(s: LabelSetup, groups: number[]): string {
  const w = paperWidth(s);
  const first = groups[0] ?? 1;
  const last = groups[groups.length - 1] ?? first;
  let css = `@page { size: ${w}mm ${round(first * pitch(s))}mm; margin: 0; }`;
  if (last !== first) css += ` @page lbl-last { size: ${w}mm ${round(last * pitch(s))}mm; margin: 0; }`;
  return css;
}

/**
 * The barcode drawing for a block `widthMm` wide, for a 203 dpi printer
 * (8 dots per mm): each bar is a whole number of dots (3, or 2 when the block
 * is narrow), so all bars print the same width. Returns the drawing width and
 * the white space before the bars, in bar widths (modules).
 */
export function barcodeFit(widthMm: number): { width: number; left: number } {
  const dots = Math.max(1, Math.round(widthMm * 8));
  const perModule = widthMm >= 38 ? 3 : 2;
  const width = Math.max(95 + 4, dots / perModule);
  return { width, left: round((width - 95) / 2) };
}

/** Text size factor: 1 for the 50 × 40 mm sticker, smaller / bigger for others. */
export function textScale(s: LabelSetup): number {
  const c = contentSize(s);
  return round(Math.max(0.5, Math.min(1.6, Math.min(c.w / 50, c.h / 37.5))) * (s.font / 100), 3);
}

function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
