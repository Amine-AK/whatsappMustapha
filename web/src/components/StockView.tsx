"use client";

import { useMemo, useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import { CONDITIONS, newLedgerId, nowParts, type Condition, type StockItem } from "@/lib/ledger";
import { displayDate } from "@/lib/receipt";
import { normalizeText, round2, searchStock } from "@/lib/shop";
import { Modal } from "./Modal";
import { readSeller } from "./SaleForm";
import type { LedgerState } from "./useLedger";
import { Confirm, Field, parseAmount } from "./ui";

const LOW = 1;
const REASONS = ["وصلات السلعة", "جرد (تصحيح)", "خاسرة / ضايعة", "رجعات من الزبون", "رجعت للمورد"];

type Sub = { kind: "add" } | { kind: "edit"; item: StockItem } | { kind: "adjust"; item: StockItem } | { kind: "delete"; item: StockItem } | null;

export function StockView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sub, setSub] = useState<Sub>(null);

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
    <div className="view">
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
        <button type="button" className="btn primary" onClick={() => setSub({ kind: "add" })}>
          ＋ سلعة جديدة
        </button>
      </div>

      <div className="search-row">
        <label className="visually-hidden" htmlFor="stock-search">
          قلب فالمخزون
        </label>
        <input id="stock-search" type="search" className="search" placeholder="قلب بالسمية، الفئة ولا IMEI…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className={`btn ${onlyLow ? "selected" : ""}`} aria-pressed={onlyLow} onClick={() => setOnlyLow((x) => !x)}>
          ⚠️ قليلة
        </button>
      </div>
      <div className="chips" role="group" aria-label="الفئة">
        <button type="button" className={`chip ${category === "" ? "on" : ""}`} aria-pressed={category === ""} onClick={() => setCategory("")}>
          الكل
        </button>
        {ledger.categories.map((c) => (
          <button key={c.name} type="button" className={`chip ${category === c.name ? "on" : ""}`} aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
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
                    {s.serial ? ` · ${s.serial}` : ""}
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
          onClose={() => setSub(null)}
          onDelete={sub.kind === "edit" ? () => setSub({ kind: "delete", item: sub.item }) : undefined}
          onSaved={(msg) => {
            onToast(msg);
            setSub(null);
          }}
        />
      )}
      {sub?.kind === "adjust" && <AdjustForm data={data} item={sub.item} onClose={() => setSub(null)} onSaved={onToast} />}
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
  onClose,
  onSaved,
  onDelete,
}: {
  data: LedgerState;
  item?: StockItem;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDelete?: () => void;
}) {
  const ledger = data.ledger!;
  const [v, setV] = useState({
    item: item?.item ?? "",
    category: item?.category ?? ledger.categories[0]?.name ?? "",
    newCategory: "",
    condition: (item?.condition ?? "جديد") as Condition,
    buyPrice: item ? String(item.buyPrice) : "",
    sellPrice: item ? String(item.sellPrice) : "",
    quantity: "1",
    serial: item?.serial ?? "",
    notes: item?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (value: string) => {
    setV((o) => ({ ...o, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const isNewCategory = v.category === "__new";
  const categoryName = isNewCategory ? v.newCategory.trim() : v.category;
  const target = ledger.categories.find((c) => c.name === categoryName)?.marginTarget ?? 0;
  const buy = parseAmount(v.buyPrice || "0");
  const suggested = buy > 0 && target > 0 ? Math.ceil((buy * (1 + target / 100)) / 10) * 10 : 0;
  const duplicate = !item && v.item.trim() && ledger.stock.find((s) => normalizeText(s.item) === normalizeText(v.item) && s.condition === v.condition);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const sell = parseAmount(v.sellPrice || String(suggested || ""));
    const qty = Number(v.quantity);
    if (!v.item.trim()) err.item = "السمية ضرورية";
    if (isNewCategory && !v.newCategory.trim()) err.newCategory = "سمية الفئة ضرورية";
    if (!(buy >= 0) || (v.buyPrice && !Number.isFinite(parseAmount(v.buyPrice)))) err.buyPrice = "الثمن غير صحيح";
    if (!(sell > 0)) err.sellPrice = "ثمن البيع ضروري";
    else if (buy > 0 && sell < buy) err.sellPrice = "ثمن البيع تحت ثمن الشراء";
    if (!item && (!Number.isInteger(qty) || qty < 0)) err.quantity = "الكمية غير صحيحة";
    setErrors(err);
    if (Object.keys(err).length) return;
    const ops: Parameters<LedgerState["run"]>[1][] = [];
    if (isNewCategory) ops.push({ type: "category.save", category: { name: categoryName, description: "", marginTarget: 0 } });
    const at = new Date().toISOString();
    const fields = { item: v.item.trim(), category: categoryName, condition: v.condition, buyPrice: buy || 0, sellPrice: sell, serial: v.serial.trim(), notes: v.notes.trim() };
    if (item) {
      ops.push({ type: "stock.update", id: item.id, base: item.updatedAt, patch: fields });
      data.run(`تعديل سلعة · ${fields.item}`, ...ops);
      return onSaved("تبدلات السلعة");
    }
    ops.push({ type: "stock.add", item: { id: newLedgerId("I"), ...fields, quantity: qty, createdAt: at, updatedAt: at } });
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
        <Field id="st-item" label="السلعة" error={errors.item} hint="مثلا: iPhone 11 64GB، ثلاجة Samsung 400L" wide>
          <input id="st-item" value={v.item} onChange={(e) => set("item")(e.target.value)} autoFocus={!item} />
        </Field>
        {duplicate && <p className="alert warn wide">كاينة ديجا «{duplicate.item}» فالمخزون ({duplicate.quantity}). بدل الكمية ديالها عوض ما تزيد وحدة جديدة.</p>}
        <Field id="st-category" label="الفئة">
          <select id="st-category" value={v.category} onChange={(e) => set("category")(e.target.value)}>
            {ledger.categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value="__new">＋ فئة جديدة…</option>
          </select>
        </Field>
        {isNewCategory ? (
          <Field id="st-newCategory" label="سمية الفئة الجديدة" error={errors.newCategory}>
            <input id="st-newCategory" value={v.newCategory} onChange={(e) => set("newCategory")(e.target.value)} />
          </Field>
        ) : (
          <Field id="st-condition" label="الحالة">
            <select id="st-condition" value={v.condition} onChange={(e) => set("condition")(e.target.value)}>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        <Field id="st-buyPrice" label="ثمن الشراء" error={errors.buyPrice} hint="ديال الوحدة، درهم">
          <input id="st-buyPrice" inputMode="decimal" dir="ltr" value={v.buyPrice} onChange={(e) => set("buyPrice")(e.target.value)} />
        </Field>
        <Field id="st-sellPrice" label="ثمن البيع" error={errors.sellPrice} hint={suggested ? `اقتراح بهامش ${target}%: ${money(suggested)}` : "درهم"}>
          <input id="st-sellPrice" inputMode="decimal" dir="ltr" placeholder={suggested ? String(suggested) : ""} value={v.sellPrice} onChange={(e) => set("sellPrice")(e.target.value)} />
        </Field>
        {!item && (
          <Field id="st-quantity" label="الكمية" error={errors.quantity}>
            <input id="st-quantity" inputMode="numeric" dir="ltr" value={v.quantity} onChange={(e) => set("quantity")(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <Field id="st-serial" label="السيريال / IMEI" hint="اختياري">
          <input id="st-serial" dir="ltr" value={v.serial} onChange={(e) => set("serial")(e.target.value)} />
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
    </Modal>
  );
}

function AdjustForm({ data, item, onClose, onSaved }: { data: LedgerState; item: StockItem; onClose: () => void; onSaved: (msg: string) => void }) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState("");
  const qty = Number(amount);
  const history = data.ledger!.moves.filter((m) => m.stockId === item.id).slice(-5).reverse();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(qty) || qty <= 0) return setError("الكمية غير صحيحة");
    const delta = sign * qty;
    data.run(`${delta > 0 ? "+" : ""}${delta} · ${item.item}`, {
      type: "stock.adjust",
      move: { id: newLedgerId("M"), stockId: item.id, date: nowParts().date, delta, reason, seller: readSeller(), createdAt: new Date().toISOString() },
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
        <Field id="adj-amount" label="شحال" error={error}>
          <input id="adj-amount" inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} autoFocus />
        </Field>
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
              </li>
            ))}
          </ul>
        )}
      </form>
    </Modal>
  );
}
