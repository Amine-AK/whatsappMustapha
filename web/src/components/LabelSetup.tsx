"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  clampField,
  contentBox,
  contentSize,
  DEFAULT_SETUP,
  LABEL_PRINTER,
  paperWidth,
  pitch,
  RECEIPT_PRINTER,
  sanitizeSetup,
  type LabelSetup,
  type NumKey,
  type Rotation,
} from "@/lib/label-layout";

const KEY = "label-setup";
// Settings saved by the old print tests: kept when moving to this setup.
const OLD_TEST_KEY = "label-print-test";
const OLD_SIZE_KEY = "label-size";

/** The printer settings for stickers, saved on this device (each PC has its own printer). */
export function useLabelSetup(): [LabelSetup, (s: LabelSetup) => void] {
  const [s, setS] = useState(DEFAULT_SETUP);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const v = JSON.parse(saved);
        // Saved before the line choices existed: start from the new default lines (no shop name).
        if (v && !("showDigits" in v)) delete v.showShop;
        return setS(sanitizeSetup(v));
      }
      const size = localStorage.getItem(OLD_SIZE_KEY);
      const dims = size === "40x30" ? { w: 40, h: 30 } : size === "50x30" ? { w: 50, h: 30 } : {};
      const old = JSON.parse(localStorage.getItem(OLD_TEST_KEY) ?? "null");
      if (old) setS(sanitizeSetup({ ...LABEL_PRINTER, ...dims, rotate: old.rotate, dx: old.dx, dy: old.dy, driverPage: old.page === "auto" }));
      else if (dims.w) setS(sanitizeSetup({ ...DEFAULT_SETUP, ...dims }));
    } catch {}
  }, []);
  return [
    s,
    (next) => {
      const clean = sanitizeSetup(next);
      setS(clean);
      try {
        localStorage.setItem(KEY, JSON.stringify(clean));
      } catch {}
    },
  ];
}

/**
 * One sticker in its place on the paper: a cell (h + gap) mm tall, the
 * sticker shifted by dx / dy, its content inside the margins, turned as set.
 * `frame` draws the sticker's edges and margins (preview and calibration).
 */
export function LabelCell({ s, frame, children }: { s: LabelSetup; frame?: boolean; children: ReactNode }) {
  const box = contentBox(s);
  const size = contentSize(s);
  const mm = (n: number) => `${n}mm`;
  return (
    <div className="label-cell" style={{ width: mm(paperWidth(s)), height: mm(pitch(s)) }}>
      {frame && <div className="label-frame" style={{ left: mm(s.dx), top: mm(s.dy), width: mm(s.w), height: mm(s.h) }} />}
      <div className={`label-content${frame ? " framed" : ""}`} style={{ left: mm(box.x), top: mm(box.y), width: mm(box.w), height: mm(box.h) }}>
        <div className="label-turn" style={{ width: mm(size.w), height: mm(size.h), transform: `translate(-50%, -50%) rotate(${s.rotate}deg)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const ROTATIONS: { value: Rotation; label: string }[] = [
  { value: 0, label: "0°" },
  { value: 90, label: "90°" },
  { value: 180, label: "180°" },
  { value: 270, label: "270°" },
];

/** The «⚙️ ضبط الطابعة» box: sizes, gap, margins, shift, and a calibration print. */
export function LabelSetupPanel({
  s,
  onChange,
  onCalibrate,
  showPrice,
  onShowPrice,
}: {
  s: LabelSetup;
  onChange: (s: LabelSetup) => void;
  onCalibrate: () => void;
  showPrice: boolean;
  onShowPrice: (v: boolean) => void;
}) {
  const tick = (label: string, on: boolean, flip: (v: boolean) => void) => (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => flip(e.target.checked)} />
      {label}
    </label>
  );
  const set = (k: NumKey, v: number) => onChange({ ...s, [k]: clampField(k, v) });
  const num = (k: NumKey, label: string, step: number, hint?: string, unit = "mm") => (
    <NumField key={k} k={k} id={`ls-${k}`} label={label} value={s[k]} step={step} unit={unit} hint={hint} onChange={(v) => set(k, v)} />
  );
  return (
    <details className="label-setup" open>
      <summary>⚙️ ضبط الطابعة (الهوامش، الفراغ، التحريك)</summary>

      <div className="field">
        <span>شنو هي الطابعة؟</span>
        <div className="segmented wide-seg" role="group" aria-label="نوع الطابعة">
          <button type="button" className={s.mode === "strip" ? "on" : ""} aria-pressed={s.mode === "strip"} onClick={() => onChange({ ...s, mode: "strip", gap: s.gap || RECEIPT_PRINTER.gap })}>
            طابعة التيكي 80mm
          </button>
          <button type="button" className={s.mode === "pages" ? "on" : ""} aria-pressed={s.mode === "pages"} onClick={() => onChange({ ...s, mode: "pages", gap: 0 })}>
            طابعة الملصقات
          </button>
        </div>
        <span className="field-hint">
          {s.mode === "strip"
            ? "طابعة التيكي ما كتشوفش الفراغ بين الملصقات: كنحطو كل ملصق فبلاصتو بالمليمتر، وكلشي كيتطبع فورقة وحدة طويلة."
            : "طابعة الملصقات كتلقى الفراغ بوحدها: ورقة لكل ملصق، خلي الفراغ 0."}
        </span>
      </div>

      <fieldset className="setup-group">
        <legend>📏 قد الملصق</legend>
        <div className="setup-grid">
          {num("w", "العرض", 0.5)}
          {num("h", "الطول", 0.5)}
          {num("gap", "الفراغ بين جوج ملصقات", 0.1, "إلا كل ملصق كيهبط شوية على اللي قبلو: نقص. إلا كيطلع: زيد.")}
          {num("pageW", "عرض الورقة للطابعة", 1, "0 = قد الملصق. جرب 72 ولا 80 إلا الطابعة كتصغر ولا كتقطع.")}
        </div>
      </fieldset>

      <div className="field">
        <span>حجم الورقة</span>
        <div className="segmented wide-seg" role="group" aria-label="حجم الورقة">
          <button type="button" className={!s.driverPage ? "on" : ""} aria-pressed={!s.driverPage} onClick={() => onChange({ ...s, driverPage: false })}>
            قد الملصق
          </button>
          <button type="button" className={s.driverPage ? "on" : ""} aria-pressed={s.driverPage} onClick={() => onChange({ ...s, driverPage: true })}>
            من الطابعة (driver)
          </button>
        </div>
        <span className="field-hint">
          «من الطابعة»: التطبيق ما كيصيفطش حجم الورقة، الملصق كيبدا من فوق الورقة اللي مختارة فإعدادات الطابعة. استعملها إلا الطابعة ما كتعرفش حجم الورقة بوحدها.
        </span>
      </div>

      {!s.driverPage && (
      <div className="field">
        <span>اتجاه الورقة للطابعة</span>
        <div className="segmented wide-seg" role="group" aria-label="اتجاه الورقة للطابعة">
          <button type="button" className={!s.landscape ? "on" : ""} aria-pressed={!s.landscape} onClick={() => onChange({ ...s, landscape: false })}>
            Portrait (طول)
          </button>
          <button type="button" className={s.landscape ? "on" : ""} aria-pressed={s.landscape} onClick={() => onChange({ ...s, landscape: true })}>
            Paysage (عرض)
          </button>
        </div>
        <span className="field-hint">جرب Paysage إلا الطابعة كتطبع الملصق مايل ولا مصغر. إلا خرج مقلوب، بدل «الدوران» لـ 180°.</span>
      </div>
      )}

      <fieldset className="setup-group">
        <legend>🔲 الهوامش داخل الملصق</legend>
        <div className="setup-grid">
          {num("top", "الفوق (header)", 0.5)}
          {num("bottom", "التحت (footer)", 0.5)}
          {num("right", "اليمين", 0.5)}
          {num("left", "اليسار", 0.5)}
        </div>
      </fieldset>

      <fieldset className="setup-group">
        <legend>↔️ تحريك الملصق كامل</legend>
        <div className="setup-grid">
          {num("dx", "لليمين (+) / لليسار (−)", 0.5)}
          {num("dy", "للتحت (+) / للفوق (−)", 0.5, "باش يبدا أول ملصق فبلاصتو.")}
        </div>
      </fieldset>

      <fieldset className="setup-group">
        <legend>✅ شنو نطبعو (من الفوق للتحت)</legend>
        <div className="print-line">
          {tick("سمية المحل", s.showShop, (v) => onChange({ ...s, showShop: v }))}
          {s.showShop && num("shopSize", "الحجم", 0.5, undefined, "pt")}
        </div>
        <div className="print-line">
          {tick("سمية السلعة", s.showItem, (v) => onChange({ ...s, showItem: v }))}
          {s.showItem && num("itemSize", "الحجم", 0.5, undefined, "pt")}
        </div>
        <div className="print-line">
          {tick("الثمن", showPrice, onShowPrice)}
          {showPrice && num("priceSize", "الحجم", 0.5, undefined, "pt")}
          {showPrice && tick("غليظ (bold)", s.priceBold, (v) => onChange({ ...s, priceBold: v }))}
        </div>
        <div className="print-line">
          <span className="print-line-name">الباركود</span>
          {num("barH", "الطول ديال الخطوط", 0.5)}
          {tick("الأرقام تحت الباركود", s.showDigits, (v) => onChange({ ...s, showDigits: v }))}
        </div>
        <div className="setup-grid">{num("lineGap", "المسافة بين السطور", 0.5)}</div>
      </fieldset>

      <fieldset className="setup-group">
        <legend>🔄 الدوران</legend>
        <div className="field">
          <div className="segmented wide-seg" role="group" aria-label="الدوران">
            {ROTATIONS.map((r) => (
              <button key={r.value} type="button" className={s.rotate === r.value ? "on" : ""} aria-pressed={s.rotate === r.value} onClick={() => onChange({ ...s, rotate: r.value })}>
                <bdi dir="ltr">{r.label}</bdi>
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="setup-actions">
        <button type="button" className="btn" onClick={onCalibrate}>
          🖨️ طبع 5 ديال التجربة بالإطار
        </button>
        <button type="button" className="btn ghost" onClick={() => onChange(s.mode === "pages" ? LABEL_PRINTER : RECEIPT_PRINTER)}>
          ↺ رجع العادي
        </button>
      </div>
      <div className="alert info setup-help">
        <strong>كيفاش نضبط:</strong>
        <span>1. طبع التجربة: كل ملصق فيه إطار ديال الحواشي ديالو.</span>
        <span>2. الإطار كيهبط شوية شوية من ملصق لملصق؟ نقص «الفراغ» بـ 0.1. كيطلع؟ زيد.</span>
        <span>3. الإطار كامل مزحزح بنفس القدر؟ استعمل «التحريك».</span>
        <span>4. فنافذة الطباعة: Margins = None، Scale = 100، وحيد «Headers and footers».</span>
        <span>5. فإعدادات الطابعة (Windows): طفي القطع الأوتوماتيكي (cut) والـ feed من بعد الطباعة.</span>
      </div>
    </details>
  );
}

function NumField({ k, id, label, value, step, unit, hint, onChange }: { k: NumKey; id: string; label: string; value: number; step: number; unit: string; hint?: string; onChange: (v: number) => void }) {
  // The typed text, so "2." or "-" can be typed before the number is complete.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const bump = (by: number) => onChange(Math.round((value + by) * 10) / 10);
  const style: CSSProperties = { direction: "ltr" };
  return (
    <div className="field num-field">
      <label htmlFor={id}>{label}</label>
      <div className="num-row" style={style}>
        <button type="button" className="btn" onClick={() => bump(-step)} aria-label={`${label} −${step}`}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Saved while typing only when already valid; else when leaving the box.
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && clampField(k, v) === v) onChange(v);
          }}
          onBlur={() => {
            const v = text.trim() === "" ? value : clampField(k, text);
            if (v !== value) onChange(v);
            setText(String(v));
          }}
        />
        <span className="num-unit">{unit}</span>
        <button type="button" className="btn" onClick={() => bump(step)} aria-label={`${label} +${step}`}>
          +
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
