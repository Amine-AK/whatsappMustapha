"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ean13Modules, newShopCode, shopCodeOf, usedCodes } from "@/lib/barcode";
import { money } from "@/lib/format";
import { newLedgerId, nowParts, type StockItem } from "@/lib/ledger";
import { SHOP } from "@/lib/receipt";
import { currentSeller, searchStock } from "@/lib/shop";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";

type Size = "50x30" | "40x25" | "a4";
const SIZES: { value: Size; label: string; hint: string; mm: string }[] = [
  { value: "50x30", label: "50×30", hint: "رول ديال طابعة الملصقات", mm: "50 × 30 mm" },
  { value: "40x25", label: "40×25", hint: "رول ديال ملصقات صغار", mm: "40 × 25 mm" },
  { value: "a4", label: "A4", hint: "ورقة A4 ديال 24 ملصق (3 × 8)", mm: "70 × 37 mm" },
];
const SIZE_KEY = "label-size";
const PRICE_KEY = "label-price";
const MAX_LABELS = 1000;

/**
 * The shop's own barcode on each product, printed as stickers: one code per
 * product, the same on every unit whatever the supplier.
 */
export function LabelPrint({ data, preselect, onClose, onToast }: { data: LedgerState; preselect?: StockItem; onClose: () => void; onToast: (msg: string) => void }) {
  const stock = data.ledger!.stock;
  const [query, setQuery] = useState("");
  // Product id → number of labels.
  const [counts, setCounts] = useState<Record<string, number>>(() => (preselect ? { [preselect.id]: Math.max(1, preselect.quantity) } : {}));
  const [size, setSize] = useState<Size>("50x30");
  const [showPrice, setShowPrice] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SIZE_KEY);
      if (s === "40x25" || s === "a4" || s === "50x30") setSize(s);
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
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={size === s.value ? "on" : ""}
                aria-pressed={size === s.value}
                onClick={() => {
                  setSize(s.value);
                  save(SIZE_KEY, s.value);
                }}
              >
                <bdi dir="ltr">{s.label}</bdi>
              </button>
            ))}
          </div>
          <span className="field-hint">
            {SIZES.find((s) => s.value === size)!.hint} · <bdi dir="ltr">{SIZES.find((s) => s.value === size)!.mm}</bdi>
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

        {labels[0] && (
          <div className="label-preview" aria-label="شكل الملصق">
            <Label item={labels[0]} code={codes.get(labels[0].id)!.code} size={size} showPrice={showPrice} />
          </div>
        )}

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
          <div id="print-root" className={`labels-print size-${size}`}>
            <style>{size === "a4" ? "@page { size: A4; margin: 10mm 0 0 0; }" : `@page { size: ${size.replace("x", "mm ")}mm; margin: 0; }`}</style>
            {labels.map((s, i) => (
              <Label key={i} item={s} code={codes.get(s.id)!.code} size={size} showPrice={showPrice} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function Label({ item, code, size, showPrice }: { item: StockItem; code: string; size: Size; showPrice: boolean }) {
  return (
    <div className={`label size-${size}`} dir="rtl" lang="ar">
      <p className="label-shop">{SHOP.name}</p>
      <p className="label-item">{item.item}</p>
      {showPrice && <p className="label-price">{money(item.sellPrice)}</p>}
      <Ean13 code={code} />
    </div>
  );
}

/** An EAN-13 as SVG bars, with the digits under it. */
export function Ean13({ code }: { code: string }) {
  const m = ean13Modules(code);
  // 11 quiet modules on each side, as scanners need.
  const W = 95 + 22;
  const bars: { x: number; w: number; guard: boolean }[] = [];
  for (let i = 0; i < m.length; ) {
    if (m[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (m[j] === "1") j++;
    bars.push({ x: i + 11, w: j - i, guard: i < 3 || (i >= 45 && i < 50) || i >= 92 });
    i = j;
  }
  return (
    <svg className="ean13" viewBox={`0 0 ${W} 42`} role="img" aria-label={`باركود ${code}`}>
      <rect width={W} height={42} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={b.guard ? 33 : 30} fill="#000" />
      ))}
      <text x={W / 2} y={41} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#000" letterSpacing={1.2}>
        {code}
      </text>
    </svg>
  );
}
