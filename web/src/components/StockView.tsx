"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import { CONDITIONS, newLedgerId, nowParts, type Condition, type StockItem } from "@/lib/ledger";
import { displayDate } from "@/lib/receipt";
import { currentSeller, findByCode, findCode, findSoldSerial, normalizeText, parseSerials, round2, searchStock } from "@/lib/shop";
import { fixAzertyDigits } from "@/lib/scanner-input";
import { BarcodeScanner } from "./BarcodeScanner";
import { CategoryForm } from "./CategoryForm";
import { CategoryIcon } from "./CategoryIcon";
import { useScannerInput } from "./useScannerInput";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { Confirm, Field, parseAmount } from "./ui";

const LOW = 1;
const REASONS = ["وصلات السلعة", "جرد (تصحيح)", "خاسرة / ضايعة", "رجعات من الزبون", "رجعت للمورد"];

type Sub =
  | { kind: "add"; code?: string }
  | { kind: "edit"; item: StockItem }
  | { kind: "adjust"; item: StockItem; scanned?: boolean }
  | { kind: "delete"; item: StockItem }
  | { kind: "scan" }
  | { kind: "categories" }
  | { kind: "category"; name?: string }
  | null;

export function StockView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sub, setSub] = useState<Sub>(null);

  const viewRef = useRef<HTMLDivElement>(null);

  /** Scanned (camera or USB scanner): more of a known product, or a new card with the code. */
  function scanned(code: string) {
    const hit = findCode(ledger.stock, code);
    setQuery("");
    // The S/N of a unit already in stock: show its product.
    if (hit?.serial) {
      onToast(`✓ S/N ${hit.serial} كاين فالمخزون: ${hit.item.item}`);
      return setSub({ kind: "edit", item: hit.item });
    }
    // A unit already sold: say when and to whom (warranty) instead of offering a new product.
    const sold = hit ? undefined : findSoldSerial(ledger.sales, code);
    if (sold) {
      const who = sold.clientId ? (ledger.clients.find((c) => c.id === sold.clientId)?.name ?? "زبون") : "كاش";
      return onToast(`S/N ${code} تباع ${displayDate(sold.date)} · ${sold.item} · ${who}`);
    }
    const found = hit?.item;
    setSub(found ? { kind: "adjust", item: found, scanned: true } : { kind: "add", code });
  }
  useScannerInput(scanned, viewRef);

  const list = useMemo(() => {
    let items = query.trim() ? searchStock(ledger.stock, query, 500) : [...ledger.stock].sort((a, b) => a.item.localeCompare(b.item, "ar"));
    if (category) items = items.filter((s) => s.category === category);
    if (onlyLow) items = items.filter((s) => s.quantity <= LOW);
    return items;
  }, [ledger.stock, query, category, onlyLow]);

  const low = ledger.stock.filter((s) => s.quantity <= LOW).length;
  const value = round2(ledger.stock.reduce((t, s) => t + Math.max(0, s.quantity) * s.buyPrice, 0));
  const units = ledger.stock.reduce((t, s) => t + Math.max(0, s.quantity), 0);

  return (
    <div className="view" ref={viewRef}>
      <section className="summary" aria-label="ملخص المخزون">
        <div className="stat">
          <span className="stat-label">السلع</span>
          <span className="stat-value">{ledger.stock.length}</span>
          <span className="stat-sub">{units} وحدة</span>
        </div>
        <div className="stat alert-stat">
          <span className="stat-label">قليلة ولا سالات</span>
          <span className="stat-value">{low}</span>
          <span className="stat-sub">{LOW} ولا قل</span>
        </div>
        <div className="stat">
          <span className="stat-label">قيمة المخزون</span>
          <span className="stat-value">{money(value)}</span>
          <span className="stat-sub">بثمن الشراء</span>
        </div>
      </section>

      <div className="actions-row in-flow">
        <button type="button" className="btn" onClick={() => setSub({ kind: "categories" })}>
          🗂️ الفئات
        </button>
        <button type="button" className="btn" onClick={() => setSub({ kind: "scan" })}>
          📷 سكاني
        </button>
        <button type="button" className="btn primary" onClick={() => setSub({ kind: "add" })}>
          ＋ سلعة جديدة
        </button>
      </div>

      <div className="search-row">
        <label className="visually-hidden" htmlFor="stock-search">
          قلب فالمخزون
        </label>
        <input
          id="stock-search"
          type="search"
          className="search"
          placeholder="قلب بالسمية، الفئة ولا الكود…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // A code scanned into the search field: same as scanning with the camera.
            const code = fixAzertyDigits(query);
            if (findByCode(ledger.stock, code) || (/^[\w-]{6,}$/.test(code) && !list.length)) {
              e.preventDefault();
              scanned(code);
            }
          }}
        />
        <button type="button" className={`btn ${onlyLow ? "selected" : ""}`} aria-pressed={onlyLow} onClick={() => setOnlyLow((x) => !x)}>
          ⚠️ قليلة
        </button>
      </div>
      <div className="chips" role="group" aria-label="الفئة">
        <button type="button" className={`chip ${category === "" ? "on" : ""}`} aria-pressed={category === ""} onClick={() => setCategory("")}>
          الكل
        </button>
        {ledger.categories.map((c) => (
          <button key={c.name} type="button" className={`chip chip-icon ${category === c.name ? "on" : ""}`} aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
            <CategoryIcon category={c} className="chip-emoji" />
            {c.name}
          </button>
        ))}
      </div>

      <p className="result-count muted">{list.length} سلعة</p>
      {list.length === 0 ? (
        <p className="empty">{ledger.stock.length ? "ما لقينا حتى سلعة." : "المخزون خاوي. زيد السلع اللي عندك باش تبيعهم بسرعة وتعرف الربح."}</p>
      ) : (
        <ul className="stock-list">
          {list.slice(0, 300).map((s) => (
            <li key={s.id} className={`stock-row ${s.quantity <= 0 ? "out" : s.quantity <= LOW ? "low" : ""}`}>
              <button type="button" className="stock-open" onClick={() => setSub({ kind: "edit", item: s })} aria-label={`تعديل ${s.item}`}>
                <span className="stock-name">
                  <strong>{s.item}</strong>
                  <span className="muted small">
                    {s.category || "بلا فئة"} · {s.condition}
                    {s.serials.length ? ` · S/N: ${s.serials.length}` : s.serial ? ` · ${s.serial}` : ""}
                  </span>
                </span>
                <span className="stock-price">
                  <span className="amount">{money(s.sellPrice)}</span>
                  <span className="muted small">شراء {money(s.buyPrice)}</span>
                </span>
              </button>
              <button type="button" className={`qty-pill ${s.quantity <= 0 ? "out" : s.quantity <= LOW ? "low" : ""}`} onClick={() => setSub({ kind: "adjust", item: s })} aria-label={`الكمية ديال ${s.item}: ${s.quantity}. بدل`}>
                <span dir="ltr">{s.quantity}</span>
                <span className="small">±</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(sub?.kind === "add" || sub?.kind === "edit") && (
        <StockForm
          data={data}
          item={sub.kind === "edit" ? sub.item : undefined}
          code={sub.kind === "add" ? sub.code : undefined}
          onClose={() => setSub(null)}
          onDelete={sub.kind === "edit" ? () => setSub({ kind: "delete", item: sub.item }) : undefined}
          onSaved={(msg) => {
            onToast(msg);
            setSub(null);
          }}
        />
      )}
      {sub?.kind === "adjust" && <AdjustForm data={data} item={sub.item} scanned={sub.scanned} onClose={() => setSub(null)} onSaved={onToast} />}
      {sub?.kind === "scan" && (
        <BarcodeScanner
          title="📷 سكاني السلعة"
          onClose={() => setSub(null)}
          onResult={scanned}
        />
      )}
      {sub?.kind === "categories" && (
        <Modal
          title="🗂️ الفئات"
          onClose={() => setSub(null)}
          footer={
            <button type="button" className="btn primary" onClick={() => setSub({ kind: "category" })}>
              ＋ فئة جديدة
            </button>
          }
        >
          <ul className="cat-list">
            {ledger.categories.map((c) => (
              <li key={c.name}>
                <button type="button" onClick={() => setSub({ kind: "category", name: c.name })} aria-label={`تعديل ${c.name}`}>
                  <CategoryIcon category={c} className="cat-list-icon" />
                  <span className="cat-list-name">
                    <strong>{c.name}</strong>
                    <span className="muted small">
                      {ledger.stock.filter((s) => s.category === c.name).length} سلعة
                      {c.marginTarget ? ` · هامش ${c.marginTarget}%` : ""}
                    </span>
                  </span>
                  <span className="muted small">تعديل</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {sub?.kind === "category" && (
        <CategoryForm
          data={data}
          category={ledger.categories.find((c) => c.name === sub.name)}
          onClose={() => setSub({ kind: "categories" })}
          onSaved={(name) => {
            onToast(sub.name ? "تبدلات الفئة" : `تزادت الفئة «${name}»`);
            setSub({ kind: "categories" });
          }}
        />
      )}
      {sub?.kind === "delete" && (
        <Confirm
          title="حذف السلعة"
          confirmLabel="إيه، احذف"
          danger
          onClose={() => setSub(null)}
          onConfirm={() => {
            data.run(`حذف سلعة · ${sub.item.item}`, { type: "stock.delete", id: sub.item.id });
            onToast("تحذفات السلعة من المخزون");
            setSub(null);
          }}
        >
          <p className="lead">
            نحيدو «{sub.item.item}» من المخزون؟ المبيعات ديالها كيبقاو فالتقارير.
          </p>
        </Confirm>
      )}
    </div>
  );
}

function StockForm({
  data,
  item,
  code,
  onClose,
  onSaved,
  onDelete,
}: {
  data: LedgerState;
  item?: StockItem;
  /** Scanned before opening the form. */
  code?: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDelete?: () => void;
}) {
  const ledger = data.ledger!;
  const [v, setV] = useState({
    item: item?.item ?? "",
    category: item?.category ?? ledger.categories[0]?.name ?? "",
    condition: (item?.condition ?? "جديد") as Condition,
    buyPrice: item ? String(item.buyPrice) : "",
    sellPrice: item ? String(item.sellPrice) : "",
    quantity: "1",
    serial: item?.serial ?? code ?? "",
    serials: "",
    notes: item?.notes ?? "",
  });
  const [scanningSerial, setScanningSerial] = useState(false);
  const newSerials = parseSerials(v.serials).map(fixAzertyDigits);
  const serialElsewhere = newSerials.find((x) => ledger.stock.some((s) => s.serials.some((y) => y.toLowerCase() === x.toLowerCase())));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (value: string) => {
    setV((o) => ({ ...o, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const [addingCategory, setAddingCategory] = useState(false);
  const categoryName = v.category;
  const target = ledger.categories.find((c) => c.name === categoryName)?.marginTarget ?? 0;
  const buy = parseAmount(v.buyPrice || "0");
  const suggested = buy > 0 && target > 0 ? Math.ceil((buy * (1 + target / 100)) / 10) * 10 : 0;
  const [scanning, setScanning] = useState(false);
  const sameCode = v.serial.trim() ? ledger.stock.find((s) => s.id !== item?.id && s.serial.trim().toLowerCase() === v.serial.trim().toLowerCase()) : undefined;
  const duplicate = !item && v.item.trim() && ledger.stock.find((s) => normalizeText(s.item) === normalizeText(v.item) && s.condition === v.condition);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const sell = parseAmount(v.sellPrice || String(suggested || ""));
    // With serial numbers, the quantity is how many there are.
    const qty = newSerials.length || Number(v.quantity);
    if (!v.item.trim()) err.item = "السمية ضرورية";
    if (!(buy >= 0) || (v.buyPrice && !Number.isFinite(parseAmount(v.buyPrice)))) err.buyPrice = "الثمن غير صحيح";
    if (!(sell > 0)) err.sellPrice = "ثمن البيع ضروري";
    else if (buy > 0 && sell < buy) err.sellPrice = "ثمن البيع تحت ثمن الشراء";
    if (!item && (!Number.isInteger(qty) || qty < 0)) err.quantity = "الكمية غير صحيحة";
    if (serialElsewhere) err.serials = `الـ S/N «${serialElsewhere}» كاين ديجا فالمخزون`;
    setErrors(err);
    if (Object.keys(err).length) return;
    const ops: Parameters<LedgerState["run"]>[1][] = [];
    const at = new Date().toISOString();
    const fields = { item: v.item.trim(), category: categoryName, condition: v.condition, buyPrice: buy || 0, sellPrice: sell, serial: fixAzertyDigits(v.serial), notes: v.notes.trim() };
    if (item) {
      ops.push({ type: "stock.update", id: item.id, base: item.updatedAt, patch: fields });
      data.run(`تعديل سلعة · ${fields.item}`, ...ops);
      return onSaved("تبدلات السلعة");
    }
    ops.push({ type: "stock.add", item: { id: newLedgerId("I"), ...fields, quantity: qty, serials: newSerials, createdAt: at, updatedAt: at } });
    data.run(`سلعة جديدة · ${fields.item}`, ...ops);
    onSaved("تزادت السلعة فالمخزون");
  }

  return (
    <Modal
      title={item ? `تعديل: ${item.item}` : "سلعة جديدة فالمخزون"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="stock-form" className="btn primary">
            {item ? "حفظ" : "زيد"}
          </button>
        </>
      }
    >
      <form id="stock-form" className="form-grid" noValidate onSubmit={submit}>
        {code && !item && (
          <p className="alert info wide">
            <span>
              ✓ تسكانا الكود <bdi dir="ltr">{code}</bdi> · هاد السلعة جديدة، كمل المعلومات ديالها.
            </span>
          </p>
        )}
        <Field id="st-item" label="السلعة" error={errors.item} hint="مثلا: iPhone 11 64GB، ثلاجة Samsung 400L" wide>
          <input id="st-item" value={v.item} onChange={(e) => set("item")(e.target.value)} autoFocus={!item} />
        </Field>
        {duplicate && <p className="alert warn wide">كاينة ديجا «{duplicate.item}» فالمخزون ({duplicate.quantity}). بدل الكمية ديالها عوض ما تزيد وحدة جديدة.</p>}
        <Field id="st-category" label="الفئة">
          <select
            id="st-category"
            value={v.category}
            onChange={(e) => (e.target.value === "__new" ? setAddingCategory(true) : set("category")(e.target.value))}
          >
            {ledger.categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value="__new">＋ فئة جديدة…</option>
          </select>
        </Field>
        <Field id="st-condition" label="الحالة">
          <select id="st-condition" value={v.condition} onChange={(e) => set("condition")(e.target.value)}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field id="st-buyPrice" label="ثمن الشراء" error={errors.buyPrice} hint="ديال الوحدة، درهم">
          <input id="st-buyPrice" inputMode="decimal" dir="ltr" value={v.buyPrice} onChange={(e) => set("buyPrice")(e.target.value)} />
        </Field>
        <Field id="st-sellPrice" label="ثمن البيع" error={errors.sellPrice} hint={suggested ? `اقتراح بهامش ${target}%: ${money(suggested)}` : "درهم"}>
          <input id="st-sellPrice" inputMode="decimal" dir="ltr" placeholder={suggested ? String(suggested) : ""} value={v.sellPrice} onChange={(e) => set("sellPrice")(e.target.value)} />
        </Field>
        {!item && (
          <Field id="st-quantity" label="الكمية" error={errors.quantity} hint={newSerials.length ? "= عدد الـ S/N" : undefined}>
            <input
              id="st-quantity"
              inputMode="numeric"
              dir="ltr"
              value={newSerials.length ? String(newSerials.length) : v.quantity}
              disabled={newSerials.length > 0}
              onChange={(e) => set("quantity")(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        {!item ? (
          <Field
            id="st-serials"
            label="الأرقام التسلسلية (S/N / IMEI)"
            error={errors.serials}
            hint={newSerials.length ? `${newSerials.length} S/N · وحدة فكل سطر` : "اختياري · وحدة فكل سطر · السكانير كيزيدهم بوحدو"}
            wide
          >
            <div className="code-row">
              <textarea id="st-serials" dir="ltr" rows={3} value={v.serials} onChange={(e) => set("serials")(e.target.value)} placeholder={"356789012345678\n356789012345679"} />
              <button type="button" className="btn" onClick={() => setScanningSerial(true)} aria-label="سكاني S/N بالكاميرا">
                📷
              </button>
            </div>
          </Field>
        ) : (
          item.serials.length > 0 && (
            <div className="field wide">
              <span>الأرقام التسلسلية (S/N) فالمخزون: {item.serials.length}</span>
              <ul className="serial-chips">
                {item.serials.map((x) => (
                  <li key={x} dir="ltr">
                    {x}
                  </li>
                ))}
              </ul>
              <span className="field-hint">زيد ولا نقص S/N بـ «±» فاللائحة.</span>
            </div>
          )
        )}
        <Field
          id="st-serial"
          label="الباركود (نفس الكود فكل علبة)"
          hint={sameCode ? `⚠️ هاد الكود عند: ${sameCode.item}` : code ? "✓ تسكانا" : "اختياري · سكاني ولا كتب"}
          wide
        >
          <div className="code-row">
            <input id="st-serial" dir="ltr" value={v.serial} onChange={(e) => set("serial")(e.target.value)} />
            <button type="button" className="btn" onClick={() => setScanning(true)} aria-label="سكاني الكود بالكاميرا">
              📷
            </button>
          </div>
        </Field>
        <Field id="st-notes" label="ملاحظات" wide>
          <input id="st-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
        {item && (
          <p className="muted small wide">
            الكمية: {item.quantity} (بدلها بـ ± فاللائحة) · تزادت {displayDate(item.createdAt.slice(0, 10))}
          </p>
        )}
        {item && onDelete && (
          <button type="button" className="btn danger-ghost wide" onClick={onDelete}>
            حذف من المخزون
          </button>
        )}
      </form>
      {addingCategory && (
        <CategoryForm
          data={data}
          onClose={() => setAddingCategory(false)}
          onSaved={(name) => {
            set("category")(name);
            setAddingCategory(false);
          }}
        />
      )}
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onResult={(c) => {
            set("serial")(c);
            setScanning(false);
          }}
        />
      )}
      {scanningSerial && (
        <BarcodeScanner
          title="📷 سكاني S/N"
          onClose={() => setScanningSerial(false)}
          onResult={(c) => {
            setV((o) => ({ ...o, serials: o.serials.trim() ? `${o.serials.trim()}\n${c}` : c }));
            setScanningSerial(false);
          }}
        />
      )}
    </Modal>
  );
}

function AdjustForm({
  data,
  item,
  scanned,
  onClose,
  onSaved,
}: {
  data: LedgerState;
  item: StockItem;
  scanned?: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState("");
  const [serialsText, setSerialsText] = useState("");
  const [outSerials, setOutSerials] = useState<string[]>([]);
  const [scanningSerial, setScanningSerial] = useState(false);
  const tracked = item.serials.length > 0;
  const inSerials = sign === 1 ? parseSerials(serialsText).map(fixAzertyDigits) : [];
  // Products followed by S/N: the quantity is the number of S/N added or ticked.
  const bySerial = tracked || (sign === 1 && inSerials.length > 0);
  const qty = bySerial ? (sign === 1 ? inSerials.length : outSerials.length) : Number(amount);
  const history = data.ledger!.moves.filter((m) => m.stockId === item.id).slice(-5).reverse();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(qty) || qty <= 0) return setError(bySerial ? "اختار ولا زيد شي S/N" : "الكمية غير صحيحة");
    const taken = inSerials.find((x) => data.ledger!.stock.some((s) => s.serials.some((y) => y.toLowerCase() === x.toLowerCase())));
    if (taken) return setError(`الـ S/N «${taken}» كاين ديجا فالمخزون`);
    const delta = sign * qty;
    data.run(`${delta > 0 ? "+" : ""}${delta} · ${item.item}`, {
      type: "stock.adjust",
      move: {
        id: newLedgerId("M"),
        stockId: item.id,
        date: nowParts().date,
        delta,
        reason,
        seller: currentSeller(),
        createdAt: new Date().toISOString(),
        ...(inSerials.length ? { serialsIn: inSerials } : {}),
        ...(sign === -1 && outSerials.length ? { serialsOut: outSerials } : {}),
      },
    });
    onSaved(`الكمية ولات ${item.quantity + delta}`);
    onClose();
  }

  return (
    <Modal
      title={`الكمية: ${item.item}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="adjust-form" className="btn primary">
            حفظ
          </button>
        </>
      }
    >
      <form id="adjust-form" className="form-grid" noValidate onSubmit={submit}>
        {scanned && <p className="alert info wide">✓ هاد السلعة كاينة فالمخزون. شحال وصلات منها؟</p>}
        <p className="lead wide">
          دابا: <strong>{item.quantity}</strong> ← من بعد: <strong>{Number.isInteger(qty) && qty > 0 ? item.quantity + sign * qty : "—"}</strong>
        </p>
        <div className="segmented wide-seg wide" role="group" aria-label="زيد ولا نقص">
          <button type="button" className={sign === 1 ? "on" : ""} aria-pressed={sign === 1} onClick={() => setSign(1)}>
            ＋ زيد
          </button>
          <button type="button" className={sign === -1 ? "on" : ""} aria-pressed={sign === -1} onClick={() => setSign(-1)}>
            − نقص
          </button>
        </div>
        {sign === 1 && (
          <Field
            id="adj-serials"
            label="الأرقام التسلسلية (S/N) ديال اللي وصلو"
            hint={inSerials.length ? `${inSerials.length} S/N = ${inSerials.length} وحدة` : tracked ? "وحدة فكل سطر · سكاني ولا كتب" : "اختياري · وحدة فكل سطر"}
            wide
          >
            <div className="code-row">
              <textarea id="adj-serials" dir="ltr" rows={3} value={serialsText} onChange={(e) => setSerialsText(e.target.value)} autoFocus={tracked} />
              <button type="button" className="btn" onClick={() => setScanningSerial(true)} aria-label="سكاني S/N بالكاميرا">
                📷
              </button>
            </div>
          </Field>
        )}
        {sign === -1 && tracked ? (
          <div className="field wide">
            <span>اختار الـ S/N اللي خرجو</span>
            <ul className="serial-pick">
              {item.serials.map((x) => (
                <li key={x}>
                  <label className="check" dir="ltr">
                    <input
                      type="checkbox"
                      checked={outSerials.includes(x)}
                      onChange={(e) => setOutSerials((l) => (e.target.checked ? [...l, x] : l.filter((y) => y !== x)))}
                    />
                    {x}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          !bySerial && (
            <Field id="adj-amount" label="شحال" error={error}>
              <input id="adj-amount" inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} autoFocus={!tracked} />
            </Field>
          )
        )}
        {bySerial && error && (
          <p className="alert error wide" role="alert">
            {error}
          </p>
        )}
        <Field id="adj-reason" label="السبب">
          <select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <p className="muted small wide">البيع كينقص المخزون بوحدو. هنا غير ملي توصل السلعة ولا فالجرد.</p>
        {history.length > 0 && (
          <ul className="plain-list wide small">
            {history.map((m) => (
              <li key={m.id}>
                <span dir="ltr">{m.delta > 0 ? `+${m.delta}` : m.delta}</span> · {m.reason} · {displayDate(m.date)}
                {m.seller ? ` · ${m.seller}` : ""}
                {m.serialsIn?.length || m.serialsOut?.length ? (
                  <>
                    {" · "}
                    <bdi dir="ltr">{[...(m.serialsIn ?? []), ...(m.serialsOut ?? [])].join(", ")}</bdi>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </form>
      {scanningSerial && (
        <BarcodeScanner
          title="📷 سكاني S/N"
          onClose={() => setScanningSerial(false)}
          onResult={(c) => {
            setSerialsText((t) => (t.trim() ? `${t.trim()}\n${c}` : c));
            setScanningSerial(false);
          }}
        />
      )}
    </Modal>
  );
}
