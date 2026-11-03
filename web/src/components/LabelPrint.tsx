"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ean13Modules, newShopCode, shopCodeOf, usedCodes } from "@/lib/barcode";
import { money } from "@/lib/format";
import { barcodeFit, contentSize, pageCss, pageGroups, textScale, type LabelSetup } from "@/lib/label-layout";
import { newLedgerId, nowParts, type StockItem } from "@/lib/ledger";
import { SHOP } from "@/lib/receipt";
import { currentSeller, searchStock } from "@/lib/shop";
import { Modal } from "./Modal";
import { LabelCell, LabelSetupPanel, useLabelSetup } from "./LabelSetup";
import type { LedgerState } from "./useLedger";

/** A roll of stickers (any size, set in «ضبط الطابعة») or an A4 sheet. */
type Paper = "roll" | "a4";
/** Roll sizes to pick in one tap (width × height, mm); any other size is typed in the setup. */
const ROLLS: [number, number][] = [
  [50, 40],
  [40, 30],
  [50, 30],
];
const SIZE_KEY = "label-size";
const PRICE_KEY = "label-price";
const MAX_LABELS = 1000;
const CALIBRATION_COUNT = 5;
// The sticker printed by the calibration print when no product is chosen.
const SAMPLE = { id: "TEST", item: "تجربة الطباعة 123", sellPrice: 99.5 } as StockItem;

/**
 * The shop's own barcode on each product, printed as stickers: one code per
 * product, the same on every unit whatever the supplier.
 */
export function LabelPrint({ data, preselect, onClose, onToast }: { data: LedgerState; preselect?: StockItem; onClose: () => void; onToast: (msg: string) => void }) {
  const stock = data.ledger!.stock;
  const [query, setQuery] = useState("");
  // Product id → number of labels.
  const [counts, setCounts] = useState<Record<string, number>>(() => (preselect ? { [preselect.id]: Math.max(1, preselect.quantity) } : {}));
  const [paper, setPaper] = useState<Paper>("roll");
  const [showPrice, setShowPrice] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [setup, setSetup] = useLabelSetup();
  // Calibration print: a few stickers with their edges drawn, nothing saved.
  const [calibrating, setCalibrating] = useState(false);
  const roll = paper === "roll";

  useEffect(() => {
    try {
      if (localStorage.getItem(SIZE_KEY) === "a4") setPaper("a4");
      setShowPrice(localStorage.getItem(PRICE_KEY) !== "no");
    } catch {}
    setMounted(true);
  }, []);

  const save = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  // The code each product prints with: its shop code, or the one it will get.
  const codes = useMemo(() => {
    const taken = usedCodes(stock);
    const out = new Map<string, { code: string; isNew: boolean }>();
    for (const s of stock) {
      const have = shopCodeOf(s);
      if (have) out.set(s.id, { code: have, isNew: false });
      else {
        const code = newShopCode(s.id, taken);
        taken.add(code);
        out.set(s.id, { code, isNew: true });
      }
    }
    return out;
  }, [stock]);

  const list = useMemo(
    () => (query.trim() ? searchStock(stock, query, 200) : [...stock].sort((a, b) => a.item.localeCompare(b.item, "ar"))).slice(0, 200),
    [stock, query],
  );
  const chosen = stock.filter((s) => (counts[s.id] ?? 0) > 0);
  const total = chosen.reduce((t, s) => t + counts[s.id], 0);
  const labels = chosen.flatMap((s) => Array.from({ length: counts[s.id] }, () => s));
  const codeOf = (s: StockItem) => codes.get(s.id)?.code ?? newShopCode(s.id, new Set());
  const printed = calibrating ? Array.from({ length: CALIBRATION_COUNT }, () => labels[0] ?? stock[0] ?? SAMPLE) : labels;
  const groups = roll ? pageGroups(setup, printed.length) : [];

  function calibrate() {
    setCalibrating(true);
    window.addEventListener("afterprint", () => setCalibrating(false), { once: true });
    setTimeout(() => window.print(), 50);
  }

  /** A sticker in its place on the roll (shifted, inside its margins, turned), or an A4 sticker. */
  const placed = (s: StockItem, key: number, frame?: boolean) =>
    roll ? (
      <LabelCell key={key} s={setup} frame={frame}>
        <RollLabel item={s} code={codeOf(s)} setup={setup} showPrice={showPrice} />
      </LabelCell>
    ) : (
      <Label key={key} item={s} code={codeOf(s)} showPrice={showPrice} />
    );

  /** The stickers as printed: on a roll, N per page (strip) or one per page. */
  function printPages() {
    if (!roll) return printed.map((s, i) => placed(s, i));
    let at = 0;
    return groups.map((n, g) => {
      const last = g === groups.length - 1 && n !== groups[0];
      const sheet = (
        <div key={g} className="label-sheet" style={last ? ({ page: "lbl-last" } as CSSProperties) : undefined}>
          {printed.slice(at, at + n).map((s, i) => placed(s, at + i, calibrating))}
        </div>
      );
      at += n;
      return sheet;
    });
  }

  const setCount = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(500, Math.floor(n) || 0)) }));

  function print() {
    // Products printed for the first time get their code saved (a move of 0 units that adds the code).
    const fresh = chosen.filter((s) => codes.get(s.id)?.isNew);
    for (const s of fresh) {
      data.run(`باركود المحل · ${s.item}`, {
        type: "stock.adjust",
        move: {
          id: newLedgerId("M"),
          stockId: s.id,
          date: nowParts().date,
          delta: 0,
          reason: "باركود المحل",
          seller: currentSeller(),
          createdAt: new Date().toISOString(),
          codesIn: [codes.get(s.id)!.code],
        },
      });
    }
    if (fresh.length) onToast(`تسجل الباركود ديال ${fresh.length} سلعة`);
    // Let React put the labels in the page before the print window opens.
    setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <Modal
        title="🏷️ باركود المحل"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              سد
            </button>
            <button type="button" className="btn primary" onClick={print} disabled={!total || total > MAX_LABELS}>
              🖨️ طبع {total ? `${total} ملصق` : ""}
            </button>
          </>
        }
      >
        <p className="muted small">
          كل سلعة كتاخد باركود ديال المحل (كيبدا بـ 2). لصقو على جميع الحبات ديالها، من أي مورد كانو. ملي تسكاني، كتلقى السلعة بحال الكود ديال المورد.
        </p>
        <div className="field">
          <span>نوع الورق</span>
          <div className="segmented wide-seg" role="group" aria-label="نوع الورق">
            {ROLLS.map(([w, h]) => {
              const on = roll && setup.w === w && setup.h === h;
              return (
                <button
                  key={`${w}x${h}`}
                  type="button"
                  className={on ? "on" : ""}
                  aria-pressed={on}
                  onClick={() => {
                    setPaper("roll");
                    save(SIZE_KEY, "roll");
                    setSetup({ ...setup, w, h });
                  }}
                >
                  <bdi dir="ltr">
                    {w}×{h}
                  </bdi>
                </button>
              );
            })}
            <button
              type="button"
              className={!roll ? "on" : ""}
              aria-pressed={!roll}
              onClick={() => {
                setPaper("a4");
                save(SIZE_KEY, "a4");
              }}
            >
              A4
            </button>
          </div>
          <span className="field-hint">
            {roll ? (
              <>
                رول ملصقات · <bdi dir="ltr">{setup.w} × {setup.h} mm</bdi> · فراغ <bdi dir="ltr">{setup.gap} mm</bdi> · قد آخر؟ بدلو فـ«ضبط الطابعة»
              </>
            ) : (
              <>
                ورقة A4 ديال 24 ملصق (3 × 8) · <bdi dir="ltr">70 × 37 mm</bdi>
              </>
            )}
          </span>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showPrice}
            onChange={(e) => {
              setShowPrice(e.target.checked);
              save(PRICE_KEY, e.target.checked ? "yes" : "no");
            }}
          />
          نطبعو الثمن على الملصق
        </label>

        {(labels[0] || roll) && (
          <div className="label-preview" aria-label="شكل الملصق">
            {placed(labels[0] ?? stock[0] ?? SAMPLE, 0, true)}
          </div>
        )}

        {roll && <LabelSetupPanel s={setup} onChange={setSetup} onCalibrate={calibrate} />}

        <label className="visually-hidden" htmlFor="label-search">
          قلب على سلعة
        </label>
        <input id="label-search" type="search" className="search" placeholder="قلب على سلعة…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="label-tools">
          <button type="button" className="link-btn" onClick={() => setCounts(Object.fromEntries(list.map((s) => [s.id, Math.max(1, s.quantity)])))}>
            ختار هادو كاملين (عدد = الكمية)
          </button>
          {chosen.length > 0 && (
            <button type="button" className="link-btn" onClick={() => setCounts({})}>
              حيد الاختيار
            </button>
          )}
        </div>
        <ul className="label-list">
          {list.map((s) => {
            const n = counts[s.id] ?? 0;
            const c = codes.get(s.id)!;
            return (
              <li key={s.id} className={n ? "on" : ""}>
                <label className="label-pick">
                  <input type="checkbox" checked={n > 0} onChange={(e) => setCount(s.id, e.target.checked ? Math.max(1, s.quantity) : 0)} />
                  <span className="label-name">
                    <strong>{s.item}</strong>
                    <span className="muted small">
                      {money(s.sellPrice)} · <bdi dir="ltr">{c.code}</bdi>
                      {c.isNew ? " · جديد" : ""}
                    </span>
                  </span>
                </label>
                {n > 0 && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    className="label-count"
                    aria-label={`عدد الملصقات ديال ${s.item}`}
                    value={n}
                    onChange={(e) => setCount(s.id, Number(e.target.value))}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {total > MAX_LABELS && <p className="alert error">بزاف: {MAX_LABELS} ملصق فالمرة على الأكثر.</p>}
      </Modal>
      {mounted &&
        createPortal(
          <div id="print-root" className={`labels-print ${roll ? "roll" : "size-a4"}`}>
            <style>{roll ? pageCss(setup, groups) : "@page { size: A4; margin: 10mm 0 0 0; }"}</style>
            {printPages()}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A sticker of an A4 sheet (70 × 37 mm). */
function Label({ item, code, showPrice }: { item: StockItem; code: string; showPrice: boolean }) {
  return (
    <div className="label size-a4" dir="rtl" lang="ar">
      <p className="label-shop">{SHOP.name}</p>
      <p className="label-item">{item.item}</p>
      {showPrice && <p className="label-price">{money(item.sellPrice)}</p>}
      <Ean13 code={code} />
    </div>
  );
}

/** A roll sticker, filling the space inside its margins; text sized to the sticker. */
function RollLabel({ item, code, setup, showPrice }: { item: StockItem; code: string; setup: LabelSetup; showPrice: boolean }) {
  const size = contentSize(setup);
  // The barcode spans the whole width, each bar a whole number of printer dots.
  const fit = barcodeFit(size.w);
  const style = { "--k": textScale(setup) } as CSSProperties;
  return (
    <div className={`label roll${size.h < 32 ? " short" : ""}`} dir="rtl" lang="ar" style={style}>
      {setup.showShop && <p className="label-shop">{SHOP.name}</p>}
      {setup.showItem && <p className="label-item">{item.item}</p>}
      {showPrice && <p className="label-price">{money(item.sellPrice)}</p>}
      <Ean13 code={code} width={fit.width} left={fit.left} />
    </div>
  );
}

/**
 * An EAN-13 as SVG bars, with the digits under it. `width` is the whole
 * drawing in bar widths (modules) and `left` the white space before the bars;
 * by default 11 white modules on each side, as scanners like.
 */
export function Ean13({ code, width = 95 + 22, left = 11 }: { code: string; width?: number; left?: number }) {
  const m = ean13Modules(code);
  const W = width;
  const bars: { x: number; w: number; guard: boolean }[] = [];
  for (let i = 0; i < m.length; ) {
    if (m[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (m[j] === "1") j++;
    bars.push({ x: i + left, w: j - i, guard: i < 3 || (i >= 45 && i < 50) || i >= 92 });
    i = j;
  }
  return (
    <svg className="ean13" viewBox={`0 0 ${W} 42`} shapeRendering="crispEdges" role="img" aria-label={`باركود ${code}`}>
      <rect width={W} height={42} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={b.guard ? 33 : 30} fill="#000" />
      ))}
      <text x={left + 47.5} y={41} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#000" letterSpacing={1.2}>
        {code}
      </text>
    </svg>
  );
}
