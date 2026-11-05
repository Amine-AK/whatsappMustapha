"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { beep, primeBeep } from "@/lib/beep";
import { fixAzertyDigits } from "@/lib/scanner-input";
import { Modal } from "./Modal";

// The browser's own barcode reader (Chrome on Android, Samsung Internet, Edge…).
interface DetectedCode {
  rawValue: string;
}
interface Detector {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}
interface DetectorClass {
  new (options?: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

const WANTED = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "data_matrix"];

function detectorClass(): DetectorClass | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector : null;
}

/** The browser's reader when there is one (phones), else the bundled one (PCs, iPhone). */
async function makeDetector(): Promise<Detector> {
  const Klass = detectorClass();
  if (Klass) {
    const supported = (await Klass.getSupportedFormats?.()) ?? WANTED;
    const formats = WANTED.filter((f) => supported.includes(f));
    if (formats.length) return new Klass({ formats });
  }
  const { createZxingDetector } = await import("@/lib/zxing-detector");
  return createZxingDetector();
}

const hasCamera = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Codes are kept short and on one line (they go in the barcode / IMEI column). */
export function cleanCode(raw: string): string {
  return fixAzertyDigits(raw.replace(/\s+/g, " ")).slice(0, 100);
}

/** What the screen says about a scanned code: shown in the list, with a high (ok) or low beep. */
export interface ScanFeedback {
  ok: boolean;
  text: string;
}

/** The same code is read again only after it left the camera for this long (ms). */
const SAME_CODE_GAP = 1500;

/**
 * Scan a QR code or a barcode with the phone camera or the PC webcam. The code
 * can also be typed, or entered with a USB / Bluetooth barcode scanner (it
 * types like a keyboard). Beeps on every read.
 *
 * `continuous`: the camera stays open and reads codes one after the other
 * (closed with «✓ ساليت»); `onResult` may return what to show for each one.
 * `paused`: stops reading (camera kept open), e.g. while a window is on top.
 */
export function BarcodeScanner({
  title = "📷 سكاني الكود",
  onResult,
  onClose,
  continuous = false,
  paused = false,
}: {
  title?: string;
  onResult: (code: string) => ScanFeedback | void;
  onClose: () => void;
  continuous?: boolean;
  paused?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "unsupported" | "denied" | "error">(() => (hasCamera() ? "starting" : "unsupported"));
  const [typed, setTyped] = useState("");
  // Codes read so far (continuous), newest first.
  const [history, setHistory] = useState<(ScanFeedback & { code: string; n: number })[]>([]);
  const done = useRef(false);
  // The latest callback / pause, without restarting the camera when the screen updates.
  const report = useRef(onResult);
  const pausedRef = useRef(paused);
  useEffect(() => {
    report.current = onResult;
    pausedRef.current = paused;
  });
  useEffect(() => primeBeep(), []);

  // One code read (camera or typed): beep, report, and stop unless continuous.
  const handle = useRef((code: string) => {});
  handle.current = (code: string) => {
    if (done.current) return;
    if (!continuous) done.current = true;
    const fb = report.current(code) ?? { ok: true, text: "" };
    beep(fb.ok);
    navigator.vibrate?.(fb.ok ? 80 : [60, 60, 60]);
    if (continuous) setHistory((h) => [{ ...fb, code, n: (h[0]?.n ?? 0) + 1 }, ...h].slice(0, 6));
  };

  useEffect(() => {
    if (!hasCamera()) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    // The code in front of the camera, and when it was last seen there.
    let last = "";
    let lastSeen = 0;

    (async () => {
      try {
        const detector = await makeDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setStatus("scanning");
        const tick = async () => {
          if (stopped || done.current) return;
          try {
            if (v.readyState >= 2) {
              const found = (await detector.detect(v)).map((c) => cleanCode(c.rawValue)).find(Boolean);
              const now = Date.now();
              if (found) {
                const again = found === last && now - lastSeen < SAME_CODE_GAP;
                last = found;
                lastSeen = now;
                // Paused: still watching, so a code left in front of the camera isn't read again on resume.
                if (!again && !pausedRef.current) handle.current(found);
              }
            }
          } catch {
            // A frame that can't be read: try the next one.
          }
          timer = window.setTimeout(tick, 150);
        };
        void tick();
      } catch (e) {
        if (!stopped) setStatus(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = cleanCode(typed);
    if (!code) return;
    handle.current(code);
    setTyped("");
  }

  const camera = status === "starting" || status === "scanning";
  const count = history.length ? history[0].n : 0;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        continuous ? (
          <button type="button" className="btn primary block" onClick={onClose}>
            ✓ ساليت{count ? ` (${count})` : ""}
          </button>
        ) : undefined
      }
    >
      {camera && (
        <div className="scanner">
          <video ref={video} className="scanner-video" muted playsInline autoPlay aria-label="الكاميرا" />
          <div className="scanner-frame" aria-hidden="true" />
          <p className="scanner-help">
            {status === "starting" ? "كنحلو الكاميرا…" : continuous ? "سكاني الأكواد وحدة من مور وحدة" : "قرب الكود للكاميرا (QR ولا باركود)"}
          </p>
        </div>
      )}
      {status === "unsupported" && <p className="alert info">ما لقيناش كاميرا فهاد الجهاز. كتب الكود ولا استعمل سكانير USB.</p>}
      {status === "denied" && <p className="alert warn">ما عطيتيش الإذن للكاميرا. سمح بيها من إعدادات المتصفح، ولا كتب الكود هنا.</p>}
      {status === "error" && <p className="alert warn">ما قدرناش نحلو الكاميرا (يمكن ما كايناش ولا مستعملة فشي برنامج آخر). كتب الكود هنا ولا استعمل سكانير USB.</p>}
      {continuous && history.length > 0 && (
        <ol className="scan-history" aria-live="polite">
          {history.map((h) => (
            <li key={h.n} className={h.ok ? "ok" : "bad"}>
              <span aria-hidden="true">{h.ok ? "✓" : "✗"}</span>
              <span className="scan-text">{h.text || <bdi dir="ltr">{h.code}</bdi>}</span>
              {h.text && (
                <bdi dir="ltr" className="small muted">
                  {h.code}
                </bdi>
              )}
            </li>
          ))}
        </ol>
      )}
      <form className="scanner-type" onSubmit={submit}>
        <label htmlFor="scan-code" className="small muted">
          {camera ? "ولا كتب الكود:" : "الكود:"}
        </label>
        <div className="search-row">
          <input id="scan-code" className="search" dir="ltr" inputMode="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus={!camera} />
          <button type="submit" className="btn primary" disabled={!cleanCode(typed)}>
            {continuous ? "زيد" : "تم"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
