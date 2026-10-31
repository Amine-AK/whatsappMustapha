"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";

// The browser's own barcode reader (Chrome on Android, Samsung Internet, Edge…).
interface DetectedCode {
  rawValue: string;
}
interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>;
}
interface DetectorClass {
  new (options?: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

const WANTED = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "data_matrix"];

function detectorClass(): DetectorClass | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector : null;
}

/** Codes are kept short and on one line (they go in the barcode / IMEI column). */
export function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 100);
}

/**
 * Scan a QR code or a barcode with the camera. Where the browser can't read
 * codes (iPhone, most PCs), the code can be typed or entered with a USB /
 * Bluetooth barcode scanner, which types like a keyboard.
 */
export function BarcodeScanner({ title = "📷 سكاني الكود", onResult, onClose }: { title?: string; onResult: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "unsupported" | "denied" | "error">(() => (detectorClass() ? "starting" : "unsupported"));
  const [typed, setTyped] = useState("");
  const done = useRef(false);
  // The latest callback, without restarting the camera when the screen updates.
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  });

  useEffect(() => {
    const Klass = detectorClass();
    if (!Klass) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    function finish(code: string) {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(80);
      report.current(code);
    }

    (async () => {
      try {
        const supported = (await Klass.getSupportedFormats?.()) ?? WANTED;
        const detector = new Klass({ formats: WANTED.filter((f) => supported.includes(f)) });
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
              if (found) return finish(found);
            }
          } catch {
            // A frame that can't be read: try the next one.
          }
          timer = window.setTimeout(tick, 200);
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
    if (code && !done.current) {
      done.current = true;
      report.current(code);
    }
  }

  const camera = status === "starting" || status === "scanning";
  return (
    <Modal title={title} onClose={onClose}>
      {camera && (
        <div className="scanner">
          <video ref={video} className="scanner-video" muted playsInline autoPlay aria-label="الكاميرا" />
          <div className="scanner-frame" aria-hidden="true" />
          <p className="scanner-help">{status === "starting" ? "كنحلو الكاميرا…" : "وجه الكاميرا للكود (QR ولا باركود)"}</p>
        </div>
      )}
      {status === "unsupported" && <p className="alert info">هاد المتصفح ما كيقراش الكود بالكاميرا (كيخدم فـ Chrome على Android). كتب الكود ولا استعمل سكانير USB.</p>}
      {status === "denied" && <p className="alert warn">ما عطيتيش الإذن للكاميرا. سمح بيها من إعدادات المتصفح، ولا كتب الكود هنا.</p>}
      {status === "error" && <p className="alert warn">ما قدرناش نحلو الكاميرا. كتب الكود هنا ولا استعمل سكانير USB.</p>}
      <form className="scanner-type" onSubmit={submit}>
        <label htmlFor="scan-code" className="small muted">
          {camera ? "ولا كتب الكود:" : "الكود:"}
        </label>
        <div className="search-row">
          <input id="scan-code" className="search" dir="ltr" inputMode="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus={!camera} />
          <button type="submit" className="btn primary" disabled={!cleanCode(typed)}>
            تم
          </button>
        </div>
      </form>
    </Modal>
  );
}
