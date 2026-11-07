/// <reference lib="webworker" />
// Decodes cropped camera frames off the main thread, so the page stays smooth.
// Messages in: { type: "init" } then { type: "decode", id, bitmap } (bitmap is transferred).
// Messages out: { type: "ready", kind } / { type: "error", message } / { type: "result", id, codes }.

import { createDetector, type Detected, type Detector } from "./detector";

export type WorkerIn = { type: "init" } | { type: "decode"; id: number; bitmap: ImageBitmap };
export type WorkerOut = { type: "ready"; kind: Detector["kind"] } | { type: "error"; message: string } | { type: "result"; id: number; codes: Detected[] };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let detector: Promise<Detector> | null = null;

scope.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "init") {
    detector ??= createDetector();
    try {
      scope.postMessage({ type: "ready", kind: (await detector).kind } satisfies WorkerOut);
    } catch (err) {
      scope.postMessage({ type: "error", message: String(err) } satisfies WorkerOut);
    }
    return;
  }
  let codes: Detected[] = [];
  try {
    detector ??= createDetector();
    codes = (await (await detector).detect(msg.bitmap)).map((c) => ({ format: c.format, rawValue: c.rawValue }));
  } catch {
    // An unreadable frame: no codes.
  } finally {
    msg.bitmap.close();
  }
  scope.postMessage({ type: "result", id: msg.id, codes } satisfies WorkerOut);
};
