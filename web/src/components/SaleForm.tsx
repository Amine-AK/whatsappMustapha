"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import {
  monthsToFinish,
  newLedgerId,
  nowParts,
  type Client,
  type Purchase,
  type Sale,
  type SaleType,
  type StockItem,
} from "@/lib/ledger";
import { formatMoroccoPhone, isManualPeriod, isValidPhone, nextDateForPeriod, PERIODS } from "@/lib/sheet-logic";
import { categoryIcon, currentSeller, findByCode, marginCheck, round2, searchStock } from "@/lib/shop";
import { fixAzertyDigits } from "@/lib/scanner-input";
import { BarcodeScanner } from "./BarcodeScanner";
import { useScannerInput } from "./useScannerInput";
import type { LedgerState } from "./useLedger";
import { ClientPicker, Field, parseAmount } from "./ui";

/** One line of the cart. Prices are per unit; the price stays text while being typed. */
interface Line {
  key: string;
  stockId: string;
  item: string;
  category: string;
  qty: number;
  /** Cost of one unit, null = unknown. */
  unitBuy: number | null;
  unitList: number;
  price: string;
  /** Units in stock when added, null = not from stock. */
  inStock: number | null;
}

export interface SaleDone {
  type: SaleType;
  ticket: string;
  clientId?: string;
  paymentId?: string;
}

const roundUp50 = (n: number) => Math.ceil(n / 50) * 50;
let lineSeq = 0;

/**
 * Fast sale: cash (no customer, money goes in the drawer) or credit (goes on a
 * customer's account, with an optional advance). Every line is logged in المبيعات;
 * products from stock go out of stock. Works offline like everything else.
 */
export function SaleForm({
  data,
  lockedClientId,
  initialType = "كاش",
  onDone,
}: {
  data: LedgerState;
  /** Opened from a customer's account: credit only, for that customer. */
  lockedClientId?: string;
  initialType?: SaleType;
  onDone: (done: SaleDone) => void;
}) {
  const ledger = data.ledger!;
  const [type, setType] = useState<SaleType>(lockedClientId ? "كريدي" : initialType);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  /** Family chosen with the big buttons: its products are listed. */
  const [cat, setCat] = useState("");
  const [error, setError] = useState("");
  // Cash
  const [given, setGiven] = useState("");
  // Credit
  const [clientId, setClientId] = useState(lockedClientId ?? "");
  const [newClient, setNewClient] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "" });
  const [advance, setAdvance] = useState("");
  const [changeInstallment, setChangeInstallment] = useState(false);
  const [newInstallment, setNewInstallment] = useState("");
  // First instalment, for a customer who doesn't have one yet.
  const [inst, setInst] = useState({ amount: "", period: "شهر", next: "", nextTouched: false });
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchStock(ledger.stock, query, 60).filter((s) => !cat || s.category === cat).slice(0, 12),
    [ledger.stock, query, cat],
  );
  // Before anything is typed: the chosen family, or what sells most.
  const browse = useMemo(() => {
    const sold = new Map<string, number>();
    for (const s of ledger.sales) if (s.stockId) sold.set(s.stockId, (sold.get(s.stockId) ?? 0) + s.quantity);
    return ledger.stock
      .filter((s) => (cat ? s.category === cat : s.quantity > 0))
      .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0) || (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || a.item.localeCompare(b.item, "ar"))
      .slice(0, cat ? 40 : 8);
  }, [ledger.stock, ledger.sales, cat]);
  const shown = query.trim() ? results : browse;
  const inStock = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ledger.stock) if (s.quantity > 0) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [ledger.stock]);
  const listOpen = open || cat !== "";
  const categories = ledger.categories;
  const summary = data.summaries.find((s) => s.client.id === clientId);

  const lineTotal = (l: Line) => {
    const p = parseAmount(l.price || "0");
    return Number.isFinite(p) ? round2(p * l.qty) : NaN;
  };
  const total = round2(lines.reduce((s, l) => s + (lineTotal(l) || 0), 0));
  const listTotal = round2(lines.reduce((s, l) => s + l.unitList * l.qty, 0));
  const advanceAmount = parseAmount(advance || "0");
  const givenAmount = parseAmount(given || "0");

  function addStock(s: StockItem) {
    setLines((ls) => {
      const same = ls.find((l) => l.stockId === s.id);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...ls,
        { key: `L${++lineSeq}`, stockId: s.id, item: s.item, category: s.category, qty: 1, unitBuy: s.buyPrice > 0 ? s.buyPrice : null, unitList: s.sellPrice, price: String(s.sellPrice || ""), inStock: s.quantity },
      ];
    });
    setQuery("");
    setError("");
    setOpen(false);
    setCat("");
  }

  /** A code from the camera or a USB scanner: the product goes in the sale. */
  function scanned(code: string) {
    const found = findByCode(ledger.stock, code);
    if (found) return addStock(found);
    setQuery(code);
    setError(`ما لقيناش الكود «${code}» فالمخزون. اختار السلعة ولا زيدها فالمخزون.`);
  }
  useScannerInput(scanned, formRef);

  function addFree(item: string, category = "", price = 0) {
    setLines((ls) => [...ls, { key: `L${++lineSeq}`, stockId: "", item, category, qty: 1, unitBuy: null, unitList: price, price: price ? String(price) : "", inStock: null }]);
    setQuery("");
    setError("");
    setOpen(false);
    setCat("");
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  // Credit: what the account looks like after this sale.
  const before = summary?.remaining ?? 0;
  const after = round2(before + total - (advanceAmount || 0));
  const c = summary?.client;
  const monthsBefore = c ? monthsToFinish(before, c.installment, c.period) : null;
  const monthsAfter = c ? monthsToFinish(after, c.installment, c.period) : null;
  const perMonth = (period: string) => (period.includes("سيمانة") ? 4.33 : period.includes("15") ? 2 : 1);
  const suggested = c && after > 0 ? roundUp50(after / Math.max(3, monthsBefore || 0) / perMonth(c.period)) : 0;
  // A customer without an instalment (new, or never set) gets one with this sale.
  const firstInstalment = type === "كريدي" && (newClient || (c !== undefined && c.installment <= 0));
  const owedAfter = newClient ? round2(total - (advanceAmount || 0)) : after;
  const instSuggested = owedAfter > 0 && !isManualPeriod(inst.period) ? roundUp50(owedAfter / 10 / perMonth(inst.period)) : 0;
  const instAmount = inst.amount.trim() ? parseAmount(inst.amount) : instSuggested;
  const instNext = inst.nextTouched ? inst.next : nextDateForPeriod(inst.period, data.today);
  const instMonths = monthsToFinish(owedAfter, instAmount || 0, inst.period);

  function validate(): string {
    if (!lines.length) return "زيد شي سلعة";
    for (const l of lines) {
      const p = parseAmount(l.price || "");
      if (!l.item.trim()) return "سمية السلعة ضرورية";
      if (!(p > 0)) return `حط الثمن ديال «${l.item}»`;
      if (l.unitBuy !== null && p < l.unitBuy) return `«${l.item}»: الثمن تحت ثمن الشراء (${money(l.unitBuy)})`;
    }
    if (type === "كريدي") {
      if (newClient) {
        if (!nc.name.trim()) return "سمية الزبون ضرورية";
        if (nc.phone.trim() && !isValidPhone(formatMoroccoPhone(nc.phone))) return "رقم الهاتف غير صحيح";
      } else if (!clientId) return "اختار الزبون";
      if (advance && !(advanceAmount >= 0)) return "التسبيق غير صحيح";
      if (advanceAmount > total) return "التسبيق كبر من المجموع";
      if (firstInstalment && inst.amount.trim() && !(parseAmount(inst.amount) >= 0)) return "الطريطة غير صحيحة";
    }
    return "";
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    setError(err);
    if (err) return;
    const at = new Date().toISOString();
    const { date, time } = nowParts();
    const ticket = newLedgerId("V");
    const ops: Parameters<LedgerState["run"]>[1][] = [];

    let customer: Client | undefined = summary?.client;
    if (type === "كريدي" && newClient) {
      customer = {
        id: newLedgerId("C"),
        name: nc.name.trim(),
        phone: nc.phone.trim(),
        installment: owedAfter > 0 ? instAmount || 0 : 0,
        period: inst.period,
        nextDueDate: owedAfter > 0 ? instNext : "",
        notes: "",
        createdAt: at,
        updatedAt: at,
      };
      ops.push({ type: "client.add", client: customer });
    }

    const sales: Sale[] = [];
    const purchases: Purchase[] = [];
    lines.forEach((l, i) => {
      const unit = parseAmount(l.price);
      const sellPrice = round2(unit * l.qty);
      const id = i === 0 ? ticket : newLedgerId("V");
      const purchaseId = type === "كريدي" ? newLedgerId("S") : "";
      sales.push({
        id,
        ticket,
        date,
        time,
        item: l.item.trim(),
        category: l.category,
        stockId: l.stockId,
        quantity: l.qty,
        buyPrice: l.unitBuy === null ? null : round2(l.unitBuy * l.qty),
        listPrice: round2((l.unitList || unit) * l.qty),
        sellPrice,
        type,
        clientId: type === "كريدي" ? customer!.id : "",
        purchaseId,
        seller: currentSeller(),
        notes: "",
        createdAt: at,
        updatedAt: at,
      });
      if (type === "كريدي") {
        purchases.push({ id: purchaseId, clientId: customer!.id, date, item: l.qty > 1 ? `${l.qty} × ${l.item.trim()}` : l.item.trim(), price: sellPrice, notes: "", createdAt: at, updatedAt: at });
      }
    });
    ops.push({ type: "sale.add", lines: sales, purchases });

    let paymentId: string | undefined;
    if (type === "كريدي" && advanceAmount > 0) {
      paymentId = newLedgerId("P");
      ops.push({
        type: "payment.add",
        payment: { id: paymentId, clientId: customer!.id, purchaseId: purchases.length === 1 ? purchases[0].id : "", date, time, amount: advanceAmount, kind: "تسبيق", notes: "", createdAt: at, updatedAt: at },
      });
    }
    if (type === "كريدي" && !newClient && firstInstalment && c && owedAfter > 0 && instAmount > 0) {
      ops.push({
        type: "client.installment",
        id: c.id,
        base: c.updatedAt,
        change: { id: newLedgerId("T"), clientId: c.id, date, oldAmount: 0, newAmount: instAmount, oldPeriod: c.period, newPeriod: inst.period, reason: `أول شراء: ${sales[0].item}`, createdAt: at },
        nextDueDate: instNext,
      });
    } else if (type === "كريدي" && !newClient && changeInstallment && c) {
      const amount = parseAmount(newInstallment || String(suggested));
      if (amount > 0) {
        ops.push({
          type: "client.installment",
          id: c.id,
          base: c.updatedAt,
          change: { id: newLedgerId("T"), clientId: c.id, date, oldAmount: c.installment, newAmount: amount, oldPeriod: c.period, newPeriod: c.period || "شهر", reason: `شرا ${sales[0].item}`, createdAt: at },
        });
      }
    }
    const what = sales.length === 1 ? sales[0].item : `${sales.length} سلع`;
    data.run(type === "كاش" ? `بيع كاش · ${what} · ${money(total)}` : `بيع كريدي · ${what} · ${customer!.name}`, ...ops);
    setLines([]);
    setGiven("");
    setAdvance("");
    setChangeInstallment(false);
    setNewInstallment("");
    setNewClient(false);
    setNc({ name: "", phone: "" });
    setInst({ amount: "", period: "شهر", next: "", nextTouched: false });
    if (!lockedClientId) setClientId("");
    onDone({ type, ticket, clientId: customer?.id, paymentId });
  }

  return (
    <>
    <form ref={formRef} className="sale-form" onSubmit={submit} noValidate>
      {!lockedClientId && (
        <div className="segmented wide-seg sale-type" role="group" aria-label="نوع البيع">
          {(["كاش", "كريدي"] as SaleType[]).map((t) => (
            <button key={t} type="button" className={type === t ? "on" : ""} aria-pressed={type === t} onClick={() => setType(t)}>
              {t === "كاش" ? "💵 بيع كاش" : "📒 بيع كريدي"}
            </button>
          ))}
        </div>
      )}

      {type === "كريدي" && !lockedClientId && (
        <section className="sale-credit" aria-label="الزبون">
          {newClient ? (
            <div className="form-grid">
              <Field id="nc-name" label="سمية الزبون">
                <input id="nc-name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              </Field>
              <Field id="nc-phone" label="الهاتف">
                <input id="nc-phone" inputMode="tel" dir="ltr" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              </Field>
              <button type="button" className="btn ghost wide" onClick={() => setNewClient(false)}>
                ← زبون قديم
              </button>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="sale-client">الزبون</label>
              <ClientPicker id="sale-client" summaries={data.summaries} value={clientId} onChange={setClientId} />
              <button type="button" className="btn ghost" onClick={() => setNewClient(true)}>
                ＋ زبون جديد
              </button>
            </div>
          )}
        </section>
      )}

      <div className="cat-tiles" role="group" aria-label="الأصناف">
        {ledger.categories.map((c) => (
          <button
            key={c.name}
            type="button"
            className={`cat-tile ${cat === c.name ? "on" : ""}`}
            aria-pressed={cat === c.name}
            onClick={() => {
              setCat((x) => (x === c.name ? "" : c.name));
              setQuery("");
            }}
          >
            <span className="cat-icon" aria-hidden="true">
              {categoryIcon(c.name)}
            </span>
            <span className="cat-name">{c.name}</span>
            <span className="cat-count">{inStock.get(c.name) ?? 0} متوفر</span>
          </button>
        ))}
      </div>

      <div className="product-search">
        <label className="visually-hidden" htmlFor="sale-search">
          قلب على سلعة
        </label>
        <div className="code-row">
        <input
          ref={searchRef}
          id="sale-search"
          type="search"
          className="search"
          placeholder={cat ? `قلب فـ ${cat}…` : "🔍 قلب على سلعة: ip 11، شارجور، ثلاجة…"}
          value={query}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="sale-results"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setCat("");
              return setOpen(false);
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            // A USB / Bluetooth scanner types the code then Enter.
            const byCode = findByCode(ledger.stock, query) ?? findByCode(ledger.stock, fixAzertyDigits(query));
            if (byCode) addStock(byCode);
            else if (shown[0]) addStock(shown[0]);
            else if (query.trim()) addFree(query.trim());
          }}
        />
          <button type="button" className="btn scan-btn" onClick={() => setScanning(true)} aria-label="سكاني الكود بالكاميرا">
            📷
          </button>
        </div>
        {listOpen && (
          // Keep the focus in the input while tapping a result.
          <ul id="sale-results" className="product-results" role="listbox" aria-label="السلع" onPointerDown={(e) => e.preventDefault()}>
            {cat ? (
              <li className="pr-head">
                <strong>
                  {categoryIcon(cat)} {cat}
                </strong>
                <button type="button" className="icon-btn" aria-label="سد" onClick={() => setCat("")}>
                  ✕
                </button>
              </li>
            ) : (
              !query.trim() && <li className="pr-hint muted small">{browse.length ? "الأكثر مبيعا · ولا كتب باش تقلب" : "المخزون خاوي · كتب سمية السلعة"}</li>
            )}
            {cat && !query.trim() && browse.length === 0 && <li className="pr-hint muted small">ما كاين حتى سلعة فهاد الصنف فالمخزون</li>}
            {query.trim() && results.length === 0 && <li className="pr-hint muted small">ما كايناش فالمخزون</li>}
            {shown.map((s) => (
              <li key={s.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => addStock(s)}>
                  <span className="pr-main">
                    <strong>{s.item}</strong>
                    <span className="muted small">
                      {s.category}
                      {s.condition === "مستعمل" ? " · مستعمل" : ""}
                      {s.serial ? ` · ${s.serial}` : ""}
                    </span>
                  </span>
                  <span className="pr-side">
                    <span className="amount">{money(s.sellPrice)}</span>
                    <span className={`stock-badge ${s.quantity > 0 ? "" : "out"}`}>{s.quantity > 0 ? `متوفر: ${s.quantity}` : "ما بقاش"}</span>
                  </span>
                </button>
              </li>
            ))}
            {(query.trim() || cat) && (
              <li>
                <button type="button" className="pr-free" onClick={() => addFree(query.trim(), cat)}>
                  {query.trim() ? `＋ زيد «${query.trim()}» بلا مخزون` : `＋ حاجة أخرى فـ ${cat} (بلا مخزون)`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>


      {lines.length === 0 ? (
        <p className="empty small">اختار صنف من الفوق ولا قلب على السلعة.</p>
      ) : (
        <ul className="cart">
          {lines.map((l) => {
            const unit = parseAmount(l.price || "0");
            const check = marginCheck(unit, l.unitBuy, categories.find((x) => x.name === l.category));
            const profit = l.unitBuy !== null && unit > 0 ? round2((unit - l.unitBuy) * l.qty) : null;
            const discount = l.unitList > 0 && unit > 0 && unit < l.unitList ? round2((l.unitList - unit) * l.qty) : 0;
            return (
              <li key={l.key} className={`cart-line ${check}`}>
                <div className="cart-top">
                  {l.stockId ? (
                    <strong className="cart-item">{l.item}</strong>
                  ) : (
                    <input className="cart-name" aria-label="السلعة" value={l.item} onChange={(e) => update(l.key, { item: e.target.value })} />
                  )}
                  <button type="button" className="icon-btn" aria-label={`حيد ${l.item}`} onClick={() => remove(l.key)}>
                    ✕
                  </button>
                </div>
                <div className="cart-row">
                  <div className="qty" role="group" aria-label="الكمية">
                    <button type="button" aria-label="نقص" onClick={() => update(l.key, { qty: Math.max(1, l.qty - 1) })}>
                      −
                    </button>
                    <span dir="ltr">{l.qty}</span>
                    <button type="button" aria-label="زيد" onClick={() => update(l.key, { qty: l.qty + 1 })}>
                      ＋
                    </button>
                  </div>
                  <label className="cart-price">
                    <span className="visually-hidden">الثمن ديال الوحدة</span>
                    <input inputMode="decimal" dir="ltr" placeholder="الثمن" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
                    <span className="muted small">درهم</span>
                  </label>
                  {!l.stockId && (
                    <select aria-label="الفئة" value={l.category} onChange={(e) => update(l.key, { category: e.target.value })}>
                      <option value="">الفئة…</option>
                      {categories.map((x) => (
                        <option key={x.name} value={x.name}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {!l.stockId && (
                    <label className="cart-cost">
                      <span className="muted small">ثمن الشراء</span>
                      <input
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="؟"
                        value={l.unitBuy ?? ""}
                        onChange={(e) => {
                          const v = parseAmount(e.target.value);
                          update(l.key, { unitBuy: e.target.value.trim() && v >= 0 ? v : null });
                        }}
                      />
                    </label>
                  )}
                </div>
                <p className="cart-meta small">
                  {l.inStock !== null && <span className={`stock-badge ${l.inStock - l.qty >= 0 ? "" : "out"}`}>{l.inStock - l.qty >= 0 ? `يبقى: ${l.inStock - l.qty}` : "ما كافيش فالمخزون"}</span>}
                  {l.unitBuy !== null && (
                    <span className="cost-badge">
                      ثمن الشراء: {money(l.unitBuy)}
                      {profit !== null && ` | الربح: ${profit >= 0 ? "+" : ""}${money(profit)}`}
                    </span>
                  )}
                  {discount > 0 && <span className="muted">· تخفيض {money(discount)}</span>}
                  {check === "loss" && <span className="danger-text">· تحت ثمن الشراء!</span>}
                  {check === "low" && <span className="warn-text">· الربح قليل</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {type === "كريدي" && (
        <section className="sale-credit" aria-label="التسبيق">
          <Field id="sale-advance" label="التسبيق" hint="اللي خلص دابا (كيدخل للصندوق)">
            <input id="sale-advance" inputMode="decimal" dir="ltr" value={advance} onChange={(e) => setAdvance(e.target.value)} />
          </Field>
          {firstInstalment && total > 0 && (
            <div className="installment-hint first-instalment">
              <p className="form-section-title">الطريطة</p>
              <div className="form-grid">
                <Field id="sale-inst-amount" label="المبلغ" hint={instSuggested ? `اقتراح: ${money(instSuggested)}` : "درهم"}>
                  <input
                    id="sale-inst-amount"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder={instSuggested ? String(instSuggested) : ""}
                    value={inst.amount}
                    onChange={(e) => setInst((x) => ({ ...x, amount: e.target.value }))}
                  />
                </Field>
                <Field id="sale-inst-period" label="كل">
                  <select id="sale-inst-period" value={inst.period} onChange={(e) => setInst((x) => ({ ...x, period: e.target.value }))}>
                    {PERIODS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field id="sale-inst-next" label="الدفعة المقبلة" wide>
                  <input id="sale-inst-next" type="date" value={instNext} min={data.today} onChange={(e) => setInst((x) => ({ ...x, next: e.target.value, nextTouched: true }))} />
                </Field>
              </div>
              {owedAfter > 0 && (
                <p className="small">
                  الكريدي: <strong>{money(owedAfter)}</strong>
                  {instMonths ? ` · غادي يخلص فـ ${instMonths} شهر تقريبا` : ""}
                </p>
              )}
            </div>
          )}
          {summary && !firstInstalment && total > 0 && (
            <div className="installment-hint">
              <p>
                الكريدي من بعد هاد البيع: <strong>{money(after)}</strong>
                {c && c.installment > 0 && monthsAfter !== null && (
                  <>
                    {" "}
                    · بالطريطة دابا ({money(c.installment)}) غادي يخلص فـ <strong>{monthsAfter} شهر</strong>
                  </>
                )}
              </p>
              <label className="check">
                <input type="checkbox" checked={changeInstallment} onChange={(e) => setChangeInstallment(e.target.checked)} />
                بدل الطريطة {suggested > 0 && <span className="muted">(اقتراح: {money(suggested)})</span>}
              </label>
              {changeInstallment && (
                <Field id="sale-newInstallment" label={`الطريطة الجديدة (كل ${c?.period || "شهر"})`}>
                  <input id="sale-newInstallment" inputMode="decimal" dir="ltr" placeholder={String(suggested)} value={newInstallment} onChange={(e) => setNewInstallment(e.target.value)} />
                </Field>
              )}
            </div>
          )}
        </section>
      )}

      <div className="checkout">
        <div className="checkout-sum">
          <span className="muted small">المجموع{listTotal > total ? ` (عوض ${money(listTotal)})` : ""}</span>
          <strong className="checkout-total">{money(total)}</strong>
          {type === "كاش" && (
            <label className="given">
              <span className="muted small">عطاك</span>
              <input inputMode="decimal" dir="ltr" placeholder="—" value={given} onChange={(e) => setGiven(e.target.value)} />
              {givenAmount > 0 && total > 0 && (
                <span className={givenAmount >= total ? "ok-text" : "danger-text"}>
                  {givenAmount >= total ? `رد ليه ${money(round2(givenAmount - total))}` : `ناقص ${money(round2(total - givenAmount))}`}
                </span>
              )}
            </label>
          )}
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary block" disabled={!lines.length}>
          {type === "كاش" ? `💵 سجل البيع كاش · ${money(total)}` : `📒 سجل البيع كريدي · ${money(total)}`}
        </button>
      </div>
    </form>
    {scanning && (
      <BarcodeScanner
        title="📷 سكاني السلعة"
        onClose={() => setScanning(false)}
        onResult={(code) => {
          setScanning(false);
          scanned(code);
        }}
      />
    )}
    </>
  );
}
