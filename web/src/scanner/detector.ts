// The barcode reader: the browser's own BarcodeDetector when it reads all our
// formats (Chrome on Android), else the `barcode-detector` ponyfill (ZXing-C++
// in WebAssembly: iPhone, PCs). Works in a page and in a Web Worker.

import { SCAN_FORMATS } from "./formats";

/** Our copy of the reader's .wasm (copied from node_modules by scripts/copy-zxing-wasm.mjs): works offline, no CDN. */
export const WASM_PATH = "/scanner/zxing_reader.wasm";

export interface Detected {
  format: string;
  rawValue: string;
}

export interface Detector {
  detect(source: ImageBitmapSource): Promise<Detected[]>;
  /** "native" or "wasm", for diagnostics. */
  kind: "native" | "wasm";
}

interface DetectorClass {
  new (options: { formats: string[] }): { detect(source: ImageBitmapSource): Promise<Detected[]> };
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeClass(): DetectorClass | null {
  const g = globalThis as unknown as { BarcodeDetector?: DetectorClass };
  return typeof g.BarcodeDetector === "function" ? g.BarcodeDetector : null;
}

export async function createDetector(): Promise<Detector> {
  const formats = [...SCAN_FORMATS];
  const Native = nativeClass();
  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? [];
      if (formats.every((f) => supported.includes(f))) {
        const d = new Native({ formats });
        return { kind: "native", detect: (src) => d.detect(src) };
      }
    } catch {
      // Fall through to the WebAssembly reader.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  const wasmUrl = new URL(WASM_PATH, globalThis.location.origin).href;
  // Load the .wasm from our own server now (fails here, clearly, if it can't).
  await prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  const d = new BarcodeDetector({ formats });
  return { kind: "wasm", detect: (src) => d.detect(src) };
}
