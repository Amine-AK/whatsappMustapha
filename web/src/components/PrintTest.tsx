"use client";

// DEV ONLY: print orientation and position tests for the barcode stickers.
// Used to find the right settings for each printer. Remove after testing
// (this file, its uses in LabelPrint.tsx and the «print test» CSS).

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export type Rotation = 0 | 90 | 180 | 270;
export type PageMode = "label" | "auto";

export interface PrintTestSettings {
  rotate: Rotation;
  /** "label": the page is the sticker's size; "auto": the printer driver decides. */
  page: PageMode;
  /** Shift in mm (right / down). */
  dx: number;
  dy: number;
}

const KEY = "label-print-test";
export const DEFAULT_TEST: PrintTestSettings = { rotate: 0, page: "label", dx: 0, dy: 0 };

export function usePrintTest(): [PrintTestSettings, (s: PrintTestSettings) => void] {
  const [s, setS] = useState(DEFAULT_TEST);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (v && [0, 90, 180, 270].includes(v.rotate) && (v.page === "label" || v.page === "auto")) {
        setS({ rotate: v.rotate, page: v.page, dx: Number(v.dx) || 0, dy: Number(v.dy) || 0 });
      }
    } catch {}
  }, []);
  return [
    s,
    (next) => {
      setS(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    },
  ];
}

/** The @page rule for a roll of w × h mm stickers. */
export function pageRule(w: number, h: number, t: PrintTestSettings): string {
  if (t.page === "auto") return "@page { margin: 0; }";
  const turned = t.rotate === 90 || t.rotate === 270;
  return `@page { size: ${turned ? h : w}mm ${turned ? w : h}mm; margin: 0; }`;
}

/** One printed page holding one sticker, turned and shifted as set. */
export function TestPage({ w, h, t, children }: { w: number; h: number; t: PrintTestSettings; children: ReactNode }) {
  const turned = t.rotate === 90 || t.rotate === 270;
  const box: CSSProperties = { width: `${turned ? h : w}mm`, height: `${turned ? w : h}mm` };
  const inner: CSSProperties = {
    transform: `translate(-50%, -50%) translate(${t.dx}mm, ${t.dy}mm) rotate(${t.rotate}deg)`,
  };
  return (
    <div className="label-page" style={box}>
      <div className="label-page-inner" style={inner}>
        {children}
      </div>
    </div>
  );
}

const ROTATIONS: { value: Rotation; label: string }[] = [
  { value: 0, label: "0° عادي" },
  { value: 90, label: "90°" },
  { value: 180, label: "180° مقلوب" },
  { value: 270, label: "270°" },
];

/** The settings box shown in the sticker window while testing. */
export function PrintTestPanel({ t, onChange, onTestPrint }: { t: PrintTestSettings; onChange: (t: PrintTestSettings) => void; onTestPrint: () => void }) {
  const shift = (k: "dx" | "dy", by: number) => onChange({ ...t, [k]: Math.max(-10, Math.min(10, Math.round((t[k] + by) * 2) / 2)) });
  return (
    <fieldset className="print-test">
      <legend>🧪 تجربة الطباعة (مؤقت، غادي يتحيد)</legend>
      <div className="field">
        <span>الاتجاه (Orientation)</span>
        <div className="segmented" role="group" aria-label="الاتجاه">
          {ROTATIONS.map((r) => (
            <button key={r.value} type="button" className={t.rotate === r.value ? "on" : ""} aria-pressed={t.rotate === r.value} onClick={() => onChange({ ...t, rotate: r.value })}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="field-hint">90° و 270° كيقلبو الورقة (العرض ولا الطول). جرب ملي يخرج الملصق مايل ولا مقطوع.</span>
      </div>
      <div className="field">
        <span>حجم الورقة</span>
        <div className="segmented" role="group" aria-label="حجم الورقة">
          <button type="button" className={t.page === "label" ? "on" : ""} aria-pressed={t.page === "label"} onClick={() => onChange({ ...t, page: "label" })}>
            قد الملصق
          </button>
          <button type="button" className={t.page === "auto" ? "on" : ""} aria-pressed={t.page === "auto"} onClick={() => onChange({ ...t, page: "auto" })}>
            من الطابعة (driver)
          </button>
        </div>
        <span className="field-hint">«من الطابعة»: كيتبع حجم الورق اللي مختار فإعدادات الطابعة.</span>
      </div>
      <div className="print-test-shift">
        <span>
          التحريك: <bdi dir="ltr">X {t.dx} mm · Y {t.dy} mm</bdi>
        </span>
        <div className="print-test-arrows" dir="ltr">
          <button type="button" className="btn" onClick={() => shift("dx", -0.5)} aria-label="لليسار">
            ←
          </button>
          <button type="button" className="btn" onClick={() => shift("dy", -0.5)} aria-label="للفوق">
            ↑
          </button>
          <button type="button" className="btn" onClick={() => shift("dy", 0.5)} aria-label="للتحت">
            ↓
          </button>
          <button type="button" className="btn" onClick={() => shift("dx", 0.5)} aria-label="لليمين">
            →
          </button>
          <button type="button" className="btn" onClick={() => onChange(DEFAULT_TEST)}>
            ↺
          </button>
        </div>
      </div>
      <button type="button" className="btn wide" onClick={onTestPrint}>
        🖨️ طبع ملصق واحد للتجربة
      </button>
      <span className="field-hint">ملصق التجربة ما كيسجل حتى باركود. ملي تلقى الإعداد المزيان، قولو لينا باش نخليوه هو العادي.</span>
    </fieldset>
  );
}
