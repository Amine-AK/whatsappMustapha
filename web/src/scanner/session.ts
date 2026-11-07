// A scanning session: camera open, frames decoded one at a time (frames that
// arrive while one is being decoded are dropped), reads confirmed, hint after
// a few seconds without a read. The camera stays open while paused.

import { closeCamera, openCamera, setTorch } from "./camera";
import { createConfirmer } from "./confirm";
import { createFrameDecoder, type FrameDecoder } from "./decoder";
import { isValidRead } from "./formats";
import { roiInVideo } from "./roi";

/** No code read for this long: show the hint. */
export const HINT_AFTER_MS = 3000;

export interface ScanSession {
  hasTorch: boolean;
  setTorch(on: boolean): Promise<boolean>;
  /** Pause / resume decoding (the camera stays on). */
  setPaused(paused: boolean): void;
  stop(): void;
  /** Where frames are decoded, and by what: for diagnostics. */
  info: { decoder: FrameDecoder["where"] };
}

export interface SessionOptions {
  video: HTMLVideoElement;
  /** A confirmed code (raw value). */
  onCode: (code: string) => void;
  onHint: (show: boolean) => void;
  /** Aborted when the scanner closes: everything opened so far is closed. */
  signal: AbortSignal;
  paused?: boolean;
}

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export async function startScanSession({ video, onCode, onHint, signal, paused = false }: SessionOptions): Promise<ScanSession> {
  const abortError = () => new DOMException("closed", "AbortError");
  // Camera and reader start together (the reader may download its .wasm).
  const decoderP = createFrameDecoder();
  let cam: Awaited<ReturnType<typeof openCamera>> | null = null;
  let decoder: FrameDecoder | null = null;
  try {
    cam = await openCamera();
    if (signal.aborted) throw abortError();
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    decoder = await decoderP;
    if (signal.aborted) throw abortError();
  } catch (err) {
    closeCamera(cam?.stream ?? null);
    void decoderP.then((d) => d.dispose()).catch(() => {});
    throw err;
  }

  const v = video as VideoWithFrames;
  const confirmer = createConfirmer();
  let isPaused = paused;
  let busy = false;
  let stopped = false;
  let frameId = 0;
  let lastReadAt = performance.now();
  let hintShown = false;
  const setHint = (show: boolean) => {
    if (show !== hintShown) {
      hintShown = show;
      onHint(show);
    }
  };

  async function decodeOnce() {
    if (!decoder || v.readyState < 2 || !v.videoWidth) return;
    const roi = roiInVideo(v.videoWidth, v.videoHeight, v.clientWidth, v.clientHeight);
    let codes;
    try {
      codes = await decoder.decode(v, roi);
    } catch {
      return;
    }
    if (stopped || isPaused) return;
    const now = performance.now();
    const good = codes.find((c) => isValidRead(c.format, c.rawValue.trim()));
    if (good && confirmer.read(good.rawValue.trim(), now)) {
      lastReadAt = now;
      setHint(false);
      onCode(good.rawValue.trim());
    }
  }

  function onFrame() {
    if (stopped) return;
    if (!isPaused) {
      if (!busy) {
        busy = true;
        void decodeOnce().finally(() => {
          busy = false;
        });
      }
      setHint(performance.now() - lastReadAt > HINT_AFTER_MS);
    }
    schedule();
  }

  function schedule() {
    if (stopped) return;
    frameId = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(frameId);
    else cancelAnimationFrame(frameId);
    decoder?.dispose();
    closeCamera(cam!.stream);
    v.srcObject = null;
  }
  signal.addEventListener("abort", stop, { once: true });
  schedule();

  return {
    hasTorch: cam.hasTorch,
    setTorch: (on) => setTorch(cam!.track, on),
    setPaused(p) {
      if (p === isPaused) return;
      isPaused = p;
      if (!p) {
        // Re-enabled: the code still in front isn't read again on the spot.
        confirmer.resume(performance.now());
        lastReadAt = performance.now();
      } else setHint(false);
    },
    stop,
    info: { decoder: decoder.where },
  };
}
