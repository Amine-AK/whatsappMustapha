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
  /**
   * Paysage: the page goes to the printer in landscape (width and height
   * swapped, the stickers drawn turned 90°), for drivers that print sideways.
   */
  landscape: boolean;
  /**
   * Page size from the printer (driver): no size is sent, the stickers start
   * at the top of the paper chosen in the printer's settings. For printers
   * that don't take the page size from the app.
   */
  driverPage: boolean;
  /** What is printed, one line under the other, and how big (pt for text, mm for the barcode). */
  showShop: boolean;
  shopSize: number;
  showItem: boolean;
  itemSize: number;
  priceSize: number;
  priceBold: boolean;
  barH: number;
  /** The code's digits under the bars. */
  showDigits: boolean;
  /** Space between two lines (mm). */
  lineGap: number;
  /** Barcode width, % of the space inside the margins. */
  barW: number;
  /** Each line moved by hand from its place in the stack (mm, in the sticker's own direction). */
  moves: Record<Part, Move>;
}

/** The lines of a sticker that can be moved and resized with the fingers. */
export type Part = "shop" | "item" | "price" | "code";
export const PARTS: Part[] = ["shop", "item", "price", "code"];
export type Move = { x: number; y: number };
const NO_MOVES: Record<Part, Move> = { shop: { x: 0, y: 0 }, item: { x: 0, y: 0 }, price: { x: 0, y: 0 }, code: { x: 0, y: 0 } };

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
  landscape: false,
  driverPage: false,
  showShop: false,
  shopSize: 6.5,
  showItem: true,
  itemSize: 7,
  priceSize: 14,
  priceBold: true,
  barH: 12,
  showDigits: false,
  lineGap: 1.5,
  barW: 100,
  moves: NO_MOVES,
};

/** A label printer (HPRT N41…) that finds the gaps itself. */
export const LABEL_PRINTER: LabelSetup = { ...RECEIPT_PRINTER, gap: 0, mode: "pages" };

export const DEFAULT_SETUP = RECEIPT_PRINTER;

export type NumKey = "w" | "h" | "gap" | "pageW" | "top" | "bottom" | "left" | "right" | "dx" | "dy" | "shopSize" | "itemSize" | "priceSize" | "barH" | "lineGap" | "barW";

const LIMITS: Record<NumKey, [number, number]> = {
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
  shopSize: [4, 30],
  itemSize: [4, 30],
  priceSize: [4, 40],
  barH: [4, 60],
  lineGap: [0, 20],
  barW: [30, 100],
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
  for (const k of ["showShop", "showItem", "priceBold", "showDigits", "landscape", "driverPage"] as const) {
    if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  }
  const moves = (r.moves && typeof r.moves === "object" ? r.moves : {}) as Record<string, { x?: unknown; y?: unknown }>;
  out.moves = Object.fromEntries(PARTS.map((k) => [k, { x: clampMove(moves[k]?.x), y: clampMove(moves[k]?.y) }])) as Record<Part, Move>;
  // The margins must leave some room for the sticker's content.
  if (out.left + out.right > out.w - 10) out.left = out.right = 0;
  if (out.top + out.bottom > out.h - 8) out.top = out.bottom = 0;
  return out;
}

function clampMove(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.max(-60, Math.min(60, n)) * 10) / 10 : 0;
}

/**
 * A finger moved a line by (dx, dy) mm on the screen: the move in the
 * sticker's own direction (the content may be turned 90°, 180° or 270°).
 */
export function moveBy(s: LabelSetup, part: Part, dx: number, dy: number): LabelSetup {
  const a = (-s.rotate * Math.PI) / 180;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  const m = s.moves[part];
  return { ...s, moves: { ...s.moves, [part]: { x: clampMove(m.x + x), y: clampMove(m.y + y) } } };
}

/** Two fingers spread `ratio` times since the gesture began on `start`: the line's size follows. */
export function resizeBy(start: LabelSetup, part: Part, ratio: number): LabelSetup {
  const k = Math.max(0.2, Math.min(5, ratio));
  if (part === "code") return { ...start, barH: clampField("barH", start.barH * k), barW: clampField("barW", start.barW * k) };
  const key = part === "shop" ? "shopSize" : part === "item" ? "itemSize" : "priceSize";
  return { ...start, [key]: clampField(key, start[key] * k) };
}

/** Every line back in its place in the stack. */
export const resetMoves = (s: LabelSetup): LabelSetup => ({ ...s, moves: NO_MOVES });

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
  // Driver page: one flow from the top, the driver cuts it in its own pages.
  if (s.driverPage && s.mode === "strip") return [count];
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
/** Paysage only applies when the app sends the page size. */
export const isLandscape = (s: LabelSetup) => s.landscape && !s.driverPage;

export function pageCss(s: LabelSetup, groups: number[]): string {
  if (s.driverPage) return "@page { margin: 0; }";
  const first = groups[0] ?? 1;
  const last = groups[groups.length - 1] ?? first;
  const size = (n: number) => {
    const p = sheetSize(s, n);
    return isLandscape(s) ? `${p.h}mm ${p.w}mm` : `${p.w}mm ${p.h}mm`;
  };
  let css = `@page { size: ${size(first)}; margin: 0; }`;
  if (last !== first) css += ` @page lbl-last { size: ${size(last)}; margin: 0; }`;
  return css;
}

/** A printed sheet of n stickers as it lies on the roll (mm), before any paysage turn. */
export function sheetSize(s: LabelSetup, n: number) {
  return { w: paperWidth(s), h: round(n * pitch(s)) };
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

function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
