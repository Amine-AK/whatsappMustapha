import { ean13Modules } from "./barcode";

// A product's barcode as a PNG image, to download and use elsewhere (another
// label program, WhatsApp, a supplier…). Browser only: drawn on a canvas.

const MODULE = 6; // px per bar width: 95 bars → 570 px, sharp when printed.
const QUIET = 11; // white bar widths on each side, as scanners like.

export interface BarcodeImageText {
  /** Product name, above the barcode. */
  name?: string;
  /** Price text (e.g. "180 درهم"), above the barcode, bold. */
  price?: string;
  /** The digits under the bars (default yes). */
  digits?: boolean;
}

/** Draws the barcode (and the name / price if given) on a new canvas. */
export function barcodeCanvas(code: string, text: BarcodeImageText = {}): HTMLCanvasElement {
  const modules = ean13Modules(code);
  const width = (95 + QUIET * 2) * MODULE;
  const pad = 24;
  const nameH = text.name ? 44 : 0;
  const priceH = text.price ? 64 : 0;
  const barsH = 200;
  const digitsH = text.digits === false ? 0 : 46;
  const height = pad + nameH + priceH + barsH + digitsH + pad;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, width, height);
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.textBaseline = "middle";

  let y = pad;
  if (text.name) {
    g.font = "500 30px system-ui, sans-serif";
    g.direction = "rtl";
    g.fillText(fit(g, text.name, width - pad * 2), width / 2, y + nameH / 2, width - pad * 2);
    y += nameH;
  }
  if (text.price) {
    g.font = "800 48px system-ui, sans-serif";
    g.direction = "rtl";
    g.fillText(text.price, width / 2, y + priceH / 2, width - pad * 2);
    y += priceH;
  }
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === "1") g.fillRect((QUIET + i) * MODULE, y, MODULE, barsH);
  }
  y += barsH;
  if (digitsH) {
    g.font = "32px ui-monospace, monospace";
    g.direction = "ltr";
    g.fillText(code.split("").join(" "), width / 2, y + digitsH / 2 + 4);
  }
  return canvas;
}

/** Saves the barcode as `<name>-<code>.png` on the device (`barcode-<code>.png` for an Arabic name). */
export function downloadBarcodePng(code: string, text: BarcodeImageText = {}): Promise<void> {
  const canvas = barcodeCanvas(code, text);
  // Latin letters and digits only: some browsers drop a file name with Arabic letters.
  const safe = (text.name ?? "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 40) || "barcode";
  return saveCanvas(canvas, `${safe}-${code}.png`);
}

/** Cuts a too long text and ends it with «…». */
function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && g.measureText(out + "…").width > max) out = out.slice(0, -1);
  return out + "…";
}

/** Many barcodes (digits under each) on one PNG, 4 per row: for codes made without a product. */
export function downloadBarcodeSheetPng(codes: string[], fileName = "barcodes"): Promise<void> {
  const tiles = codes.map((c) => barcodeCanvas(c));
  const cols = Math.min(4, tiles.length);
  const tw = tiles[0]?.width ?? 1;
  const th = tiles[0]?.height ?? 1;
  const gap = 20;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tw + (cols + 1) * gap;
  canvas.height = Math.ceil(tiles.length / cols) * (th + gap) + gap;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  tiles.forEach((t, i) => g.drawImage(t, gap + (i % cols) * (tw + gap), gap + Math.floor(i / cols) * (th + gap)));
  return saveCanvas(canvas, `${fileName}.png`);
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
