// Decodes the guide-rectangle crop of a video frame: in a Web Worker when the
// browser can (ImageBitmap crop, transferred), else on the main thread.

import type { Detected } from "./detector";
import type { Rect } from "./roi";
import type { WorkerIn, WorkerOut } from "./decoder.worker";

export interface FrameDecoder {
  decode(video: HTMLVideoElement, roi: Rect): Promise<Detected[]>;
  dispose(): void;
  where: "worker" | "main";
}

/** Crops wider than this are scaled down (still ≥ 3 px per bar for our stickers). */
const MAX_CROP_WIDTH = 1280;

const cropSize = (roi: Rect) => {
  const k = Math.min(1, MAX_CROP_WIDTH / roi.w);
  return { w: Math.max(1, Math.round(roi.w * k)), h: Math.max(1, Math.round(roi.h * k)) };
};

export async function createFrameDecoder(): Promise<FrameDecoder> {
  if (typeof Worker === "function" && typeof createImageBitmap === "function") {
    try {
      return await workerDecoder();
    } catch {
      // Module workers or ImageBitmap not usable here: decode on the main thread.
    }
  }
  return mainThreadDecoder();
}

async function workerDecoder(): Promise<FrameDecoder> {
  const worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (codes: Detected[]) => void>();
  let nextId = 0;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker timeout")), 15000);
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || "worker error"));
    };
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "ready") {
        clearTimeout(timer);
        resolve();
      } else if (m.type === "error") {
        clearTimeout(timer);
        reject(new Error(m.message));
      } else if (m.type === "result") {
        pending.get(m.id)?.(m.codes);
        pending.delete(m.id);
      }
    };
    worker.postMessage({ type: "init" } satisfies WorkerIn);
  }).catch((err: unknown) => {
    worker.terminate();
    throw err;
  });
  return {
    where: "worker",
    async decode(video, roi) {
      const size = cropSize(roi);
      // Throws if the browser can't crop a video frame: the caller sees no codes for that frame.
      const bitmap = await createImageBitmap(video, roi.x, roi.y, roi.w, roi.h, { resizeWidth: size.w, resizeHeight: size.h, resizeQuality: "high" });
      const id = nextId++;
      return new Promise<Detected[]>((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: "decode", id, bitmap } satisfies WorkerIn, [bitmap]);
      });
    },
    dispose() {
      worker.terminate();
      for (const resolve of pending.values()) resolve([]);
      pending.clear();
    },
  };
}

async function mainThreadDecoder(): Promise<FrameDecoder> {
  const { createDetector } = await import("./detector");
  const detector = await createDetector();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    where: "main",
    async decode(video, roi) {
      if (!ctx) return [];
      const size = cropSize(roi);
      canvas.width = size.w;
      canvas.height = size.h;
      ctx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, size.w, size.h);
      try {
        return await detector.detect(canvas);
      } catch {
        return [];
      }
    },
    dispose() {
      canvas.width = canvas.height = 0;
    },
  };
}
