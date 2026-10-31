// Code reader for browsers without a built-in one (Chrome/Edge on Windows and
// Linux, iPhone). Loaded only when needed: phones with BarcodeDetector never
// download it.

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.DATA_MATRIX,
];

/** Frames are shrunk to this width: plenty for a code held in front of a webcam, and fast. */
const MAX_WIDTH = 800;

/** Same shape as the browser's BarcodeDetector: detect(video) → [{ rawValue }]. */
export function createZxingDetector() {
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  return {
    async detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return [];
      const scale = Math.min(1, MAX_WIDTH / w);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Grey levels, one byte per pixel.
      const grey = new Uint8ClampedArray(canvas.width * canvas.height);
      for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      try {
        const result = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(grey, canvas.width, canvas.height))));
        return [{ rawValue: result.getText() }];
      } catch {
        // No code in this frame.
        return [];
      } finally {
        reader.reset();
      }
    },
  };
}
