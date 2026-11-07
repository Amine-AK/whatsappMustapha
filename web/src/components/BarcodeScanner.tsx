"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { beep, primeBeep } from "@/lib/beep";
import { fixAzertyDigits } from "@/lib/scanner-input";
import type { CodeKind } from "@/scanner/formats";
import type { ScanSession } from "@/scanner/session";
import { Modal } from "./Modal";

// The decoding engine lives in src/scanner/ (camera, Web Worker, check digits,
// confirmation). It is loaded only when the scanner opens, never on the server.

/**
 * Shown after a few seconds without a read. Kept as a constant to translate.
 * English: "Move the phone back a little / tilt the product to avoid reflections".
 */
export const SCAN_HINT = "بعد التيليفون شوية · ميل السلعة باش تهرب من الضو اللي كيلمع";

/** Read a QR code or a serial number (S/N) instead of a product barcode: said to the user, the code is still used. */
export const NOT_BARCODE: Record<Exclude<CodeKind, "barcode">, string> = {
  qr: "⚠️ هادا ماشي باركود (QR)",
  sn: "⚠️ هادا ماشي باركود (S/N)",
};

type Status = "starting" | "scanning" | "insecure" | "unsupported" | "denied" | "nocamera" | "busy" | "error";

const PROBLEMS: Partial<Record<Status, { level: "info" | "warn"; text: string }>> = {
  insecure: { level: "warn", text: "الكاميرا كتخدم غير فـ https (العنوان كيبدا بـ https://). كتب الكود ولا استعمل سكانير USB." },
  unsupported: { level: "info", text: "ما لقيناش كاميرا فهاد الجهاز. كتب الكود ولا استعمل سكانير USB." },
  denied: { level: "warn", text: "ما عطيتيش الإذن للكاميرا. سمح بيها من إعدادات المتصفح، ولا كتب الكود هنا." },
  nocamera: { level: "info", text: "ما لقيناش كاميرا فهاد الجهاز. كتب الكود ولا استعمل سكانير USB." },
  busy: { level: "warn", text: "ما قدرناش نحلو الكاميرا (يمكن مستعملة فشي برنامج آخر). سد البرامج الأخرى ولا كتب الكود هنا." },
  error: { level: "warn", text: "ما قدرناش نوجدو قارئ الباركود. عاود حل الصفحة ولا كتب الكود هنا." },
};

/** Codes are kept short and on one line (they go in the barcode / IMEI column). */
export function cleanCode(raw: string): string {
  return fixAzertyDigits(raw.replace(/\s+/g, " ")).slice(0, 100);
}

/** What the screen says about a scanned code: shown in the list, with a high (ok) or low beep. */
export interface ScanFeedback {
  ok: boolean;
  text: string;
}

/**
 * Scan a barcode (EAN-13, EAN-8, UPC-A, UPC-E), a QR code or a serial number
 * (Code 128, Code 39…; told «ماشي باركود») with the phone camera or the PC webcam. The code can also be typed, or entered with a USB /
 * Bluetooth barcode scanner (it types like a keyboard). Beeps on every read.
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
  const [status, setStatus] = useState<Status>("starting");
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState(false);
  // The camera box takes the camera's shape (portrait phone, landscape webcam), so the guide covers the real image.
  const [aspect, setAspect] = useState<number | null>(null);
  const [torch, setTorch] = useState<{ has: boolean; on: boolean }>({ has: false, on: false });
  // Codes read so far (continuous), newest first.
  const [history, setHistory] = useState<(ScanFeedback & { code: string; n: number; kind?: CodeKind })[]>([]);
  // «Not a barcode» line over the camera for a moment after a QR / S/N read.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const done = useRef(false);
  const session = useRef<ScanSession | null>(null);
  // The latest callback / pause, without restarting the camera when the screen updates.
  const report = useRef(onResult);
  const pausedRef = useRef(paused);
  useEffect(() => {
    report.current = onResult;
    pausedRef.current = paused;
  });
  useEffect(() => primeBeep(), []);

  // One code read (camera or typed): beep, report, and stop unless continuous.
  const handle = useRef((code: string, kind?: CodeKind) => {});
  handle.current = (code: string, kind?: CodeKind) => {
    if (done.current) return;
    if (!continuous) {
      done.current = true;
      session.current?.setPaused(true);
    }
    const fb = report.current(code) ?? { ok: true, text: "" };
    beep(fb.ok);
    navigator.vibrate?.(fb.ok ? 50 : [60, 60, 60]);
    if (continuous) setHistory((h) => [{ ...fb, code, n: (h[0]?.n ?? 0) + 1, kind }, ...h].slice(0, 6));
    if (kind && kind !== "barcode") {
      setNotice(NOT_BARCODE[kind]);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
    }
  };

  // Camera + reader: opened once, closed (tracks, worker, frame callbacks) when the scanner closes.
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const { startScanSession } = await import("@/scanner/session");
        if (abort.signal.aborted || !video.current) return;
        const s = await startScanSession({
          video: video.current,
          signal: abort.signal,
          paused: pausedRef.current,
          onCode: (raw, kind) => {
            const code = cleanCode(raw);
            if (code) handle.current(code, kind);
          },
          onHint: setHint,
        });
        if (abort.signal.aborted) return s.stop();
        session.current = s;
        setTorch({ has: s.hasTorch, on: false });
        setStatus("scanning");
      } catch (err) {
        if (abort.signal.aborted) return;
        const problem = (err as { problem?: Status }).problem;
        setStatus(problem && problem in PROBLEMS ? problem : "error");
      }
    })();
    return () => {
      abort.abort();
      session.current = null;
    };
  }, []);

  // Paused by the parent (a window on top): decoding stops, the camera stays on.
  useEffect(() => {
    session.current?.setPaused(paused || done.current);
  }, [paused, status]);

  async function toggleTorch() {
    const s = session.current;
    if (!s) return;
    const on = !torch.on;
    if (await s.setTorch(on)) setTorch({ has: true, on });
  }

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
        <div className="scanner" style={aspect ? { aspectRatio: String(aspect) } : undefined}>
          <video
            ref={video}
            className="scanner-video"
            muted
            playsInline
            autoPlay
            aria-label="الكاميرا"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspect(Math.max(3 / 4, Math.min(16 / 9, v.videoWidth / v.videoHeight)));
            }}
          />
          {/* The guide rectangle: exactly the part of the image that is decoded (src/scanner/roi.ts). */}
          <div className="scanner-frame" aria-hidden="true" />
          {torch.has && (
            <button type="button" className={`scanner-torch${torch.on ? " on" : ""}`} onClick={() => void toggleTorch()} aria-pressed={torch.on} aria-label="الضو ديال الكاميرا">
              🔦
            </button>
          )}
          {notice && (
            <p className="scanner-notice" role="status">
              {notice}
            </p>
          )}
          <p className="scanner-help" aria-live="polite">
            {status === "starting" ? "كنحلو الكاميرا…" : hint ? SCAN_HINT : continuous ? "سكاني الأكواد وحدة من مور وحدة" : "دخل الباركود فالمربع"}
          </p>
        </div>
      )}
      {PROBLEMS[status] && <p className={`alert ${PROBLEMS[status]!.level}`}>{PROBLEMS[status]!.text}</p>}
      {continuous && history.length > 0 && (
        <ol className="scan-history" aria-live="polite">
          {history.map((h) => (
            <li key={h.n} className={h.ok ? "ok" : "bad"}>
              <span aria-hidden="true">{h.ok ? "✓" : "✗"}</span>
              <span className="scan-text">{h.text || <bdi dir="ltr">{h.code}</bdi>}</span>
              {h.kind && h.kind !== "barcode" && <span className="scan-kind">{h.kind === "qr" ? "QR" : "S/N"} · ماشي باركود</span>}
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
