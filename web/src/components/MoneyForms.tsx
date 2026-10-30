"use client";

import { useMemo, useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import {
  defaultPurchaseFor,
  monthsToFinish,
  newLedgerId,
  nowParts,
  PAYMENT_KINDS,
  suggestNextDue,
  summarizeClient,
  type ClientSummary,
  type Payment,
  type PaymentKind,
  type Purchase,
} from "@/lib/ledger";
import { displayDate } from "@/lib/receipt";
import { isISODate } from "@/lib/sheet-logic";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { ChangeList, ClientPicker, diff, Field, parseAmount, type Change } from "./ui";

type Errors = Record<string, string>;

function ConfirmEdit({ title, who, changes, onBack, onSave }: { title: string; who: string; changes: Change[]; onBack: () => void; onSave: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onBack}
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            رجوع
          </button>
          <button type="button" className="btn primary" onClick={onSave}>
            أكد التعديل
          </button>
        </>
      }
    >
      <p className="lead">{who}</p>
      <ChangeList changes={changes} />
    </Modal>
  );
}

const roundUp50 = (n: number) => Math.ceil(n / 50) * 50;

// ---------------------------------------------------------------- purchase

export function PurchaseForm({
  data,
  summary,
  purchase,
  onClose,
  onDone,
}: {
  data: LedgerState;
  summary: ClientSummary;
  /** Edit this purchase; add a new one when absent. */
  purchase?: Purchase;
  onClose: () => void;
  onDone?: (paymentId?: string) => void;
}) {
  const c = summary.client;
  const today = data.today;
  const editing = Boolean(purchase);
  const [v, setV] = useState({
    item: purchase?.item ?? "",
    price: purchase ? String(purchase.price) : "",
    date: purchase?.date ?? today,
    notes: purchase?.notes ?? "",
    advance: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);

  const price = parseAmount(v.price || "0");
  const advance = parseAmount(v.advance || "0");
  const remainingAfter = summary.remaining + (price || 0) - (advance || 0);
  const monthsBefore = monthsToFinish(summary.remaining, c.installment, c.period);
  const monthsAfter = monthsToFinish(remainingAfter, c.installment, c.period);
  // Keep about the same time to finish as before the purchase (at least 3 months).
  const targetMonths = Math.max(3, monthsBefore || 0);
  const suggested = remainingAfter > 0 ? roundUp50(remainingAfter / targetMonths / (c.period.includes("سيمانة") ? 4.33 : c.period.includes("15") ? 2 : 1)) : 0;
  const [changeInstallment, setChangeInstallment] = useState(false);
  const [newInstallment, setNewInstallment] = useState("");

  const set = (k: keyof typeof v) => (value: string) => {
    setV((o) => ({ ...o, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  function validate(): boolean {
    const err: Errors = {};
    if (!v.item.trim()) err.item = "السلعة ضرورية";
    if (!(price > 0)) err.price = "ثمن البيع ضروري";
    if (!isISODate(v.date)) err.date = "التاريخ ضروري";
    if (v.advance && !(advance >= 0)) err.advance = "المبلغ غير صحيح";
    if (advance > price) err.advance = "التسبيق كبر من الثمن";
    if (changeInstallment && !(parseAmount(newInstallment || suggested.toString()) > 0)) err.newInstallment = "المبلغ غير صحيح";
    setErrors(err);
    const first = Object.keys(err)[0];
    if (first) document.getElementById(`pu-${first}`)?.focus();
    return !first;
  }

  const changes = purchase
    ? diff([
        ["السلعة", purchase.item, v.item.trim()],
        ["التاريخ", purchase.date, v.date],
        ["ثمن البيع", purchase.price, price],
        ["ملاحظات", purchase.notes, v.notes.trim()],
      ])
    : [];

  function save() {
    const at = new Date().toISOString();
    if (purchase) {
      data.run(`تعديل سلعة · ${c.name}`, {
        type: "purchase.update",
        id: purchase.id,
        base: purchase.updatedAt,
        patch: { item: v.item.trim(), date: v.date, price, notes: v.notes.trim() },
      });
      return onClose();
    }
    const p: Purchase = {
      id: newLedgerId("S"),
      clientId: c.id,
      date: v.date,
      item: v.item.trim(),
      price,
      notes: v.notes.trim(),
      createdAt: at,
      updatedAt: at,
    };
    const ops: Parameters<LedgerState["run"]>[1][] = [{ type: "purchase.add", purchase: p }];
    let paymentId: string | undefined;
    if (advance > 0) {
      paymentId = newLedgerId("P");
      ops.push({
        type: "payment.add",
        payment: { id: paymentId, clientId: c.id, purchaseId: p.id, date: v.date, time: nowParts().time, amount: advance, kind: "تسبيق", notes: "", createdAt: at, updatedAt: at },
      });
    }
    if (changeInstallment) {
      const amount = parseAmount(newInstallment || String(suggested));
      ops.push({
        type: "client.installment",
        id: c.id,
        base: c.updatedAt,
        change: { id: newLedgerId("T"), clientId: c.id, date: nowParts().date, oldAmount: c.installment, newAmount: amount, oldPeriod: c.period, newPeriod: c.period || "شهر", reason: `شرا ${p.item}`, createdAt: at },
      });
    }
    data.run(`شراء · ${p.item} · ${c.name}`, ...ops);
    onDone?.(paymentId);
    onClose();
  }

  if (confirm && purchase) {
    return <ConfirmEdit title="تأكيد تعديل السلعة" who={`${c.name}: ${purchase.item}`} changes={changes} onBack={() => setConfirm(false)} onSave={save} />;
  }

  return (
    <Modal
      title={editing ? "تعديل السلعة" : `شراء جديد: ${c.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="purchase-form" className="btn primary">
            {editing ? "متابعة" : "زيد الشراء"}
          </button>
        </>
      }
    >
      <form
        id="purchase-form"
        className="form-grid"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!validate()) return;
          if (editing) return changes.length ? setConfirm(true) : onClose();
          save();
        }}
      >
        <Field id="pu-item" label="السلعة" error={errors.item} hint="سلعة ولا خدمة: شارجور، إصلاح التيليفون…" wide>
          <input id="pu-item" value={v.item} onChange={(e) => set("item")(e.target.value)} autoFocus />
        </Field>
        <Field id="pu-price" label="ثمن البيع" error={errors.price} hint="درهم">
          <input id="pu-price" inputMode="decimal" dir="ltr" value={v.price} onChange={(e) => set("price")(e.target.value)} />
        </Field>
        <Field id="pu-date" label="التاريخ" error={errors.date}>
          <input id="pu-date" type="date" value={v.date} max={today} onChange={(e) => set("date")(e.target.value)} />
        </Field>
        {!editing && (
          <Field id="pu-advance" label="التسبيق" error={errors.advance} hint="إلا خلص شي حاجة دابا">
            <input id="pu-advance" inputMode="decimal" dir="ltr" value={v.advance} onChange={(e) => set("advance")(e.target.value)} />
          </Field>
        )}
        <Field id="pu-notes" label="ملاحظات" wide>
          <input id="pu-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>

        {!editing && price > 0 && (
          <div className="installment-hint wide">
            <p>
              الكريدي من بعد هاد الشراء: <strong>{money(remainingAfter)}</strong>
              {c.installment > 0 && monthsAfter !== null && (
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
              <Field id="pu-newInstallment" label={`الطريطة الجديدة (كل ${c.period || "شهر"})`} error={errors.newInstallment} hint={`السبب: شرا ${v.item || "…"}`}>
                <input
                  id="pu-newInstallment"
                  inputMode="decimal"
                  dir="ltr"
                  placeholder={String(suggested)}
                  value={newInstallment}
                  onChange={(e) => setNewInstallment(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- payment

export function PaymentForm({
  data,
  summary,
  payment,
  onClose,
  onDone,
}: {
  data: LedgerState;
  summary: ClientSummary;
  /** Edit (or move) this payment; record a new one when absent. */
  payment?: Payment;
  onClose: () => void;
  onDone?: (paymentId: string) => void;
}) {
  const today = data.today;
  const editing = Boolean(payment);
  const now = nowParts();
  const [clientId, setClientId] = useState(payment?.clientId ?? summary.client.id);
  const target = useMemo(() => {
    if (clientId === summary.client.id || !data.ledger) return summary;
    const other = data.ledger.clients.find((c) => c.id === clientId);
    return other ? summarizeClient(data.ledger, other, today) : summary;
  }, [clientId, summary, data.ledger, today]);

  const [v, setV] = useState({
    amount: payment ? String(payment.amount) : summary.client.installment ? String(Math.min(summary.client.installment, Math.max(summary.remaining, 0)) || "") : "",
    purchaseId: payment ? payment.purchaseId : defaultPurchaseFor(summary),
    kind: (payment?.kind ?? "دفعة") as PaymentKind,
    date: payment?.date ?? today,
    time: payment?.time ?? now.time,
    notes: payment?.notes ?? "",
    nextDueDate: suggestNextDue(summary.client, today),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const amount = parseAmount(v.amount || "");
  const after = target.remaining + (payment && clientId === payment.clientId ? payment.amount : 0) - (amount > 0 ? amount : 0);

  const set = (k: keyof typeof v) => (value: string) => {
    setV((o) => ({ ...o, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  function chooseClient(id: string) {
    setClientId(id);
    // Items belong to a customer: pick the new customer's oldest unpaid item.
    const other = data.ledger?.clients.find((c) => c.id === id);
    if (other && data.ledger) setV((o) => ({ ...o, purchaseId: defaultPurchaseFor(summarizeClient(data.ledger!, other, today)) }));
  }

  function validate(): boolean {
    const err: Errors = {};
    if (!(amount > 0)) err.amount = "دخل المبلغ";
    if (!isISODate(v.date)) err.date = "التاريخ ضروري";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) err.time = "الساعة غير صحيحة";
    setErrors(err);
    const first = Object.keys(err)[0];
    if (first) document.getElementById(`pa-${first}`)?.focus();
    return !first;
  }

  const itemName = (id: string, s: ClientSummary) => s.purchases.find((p) => p.id === id)?.item ?? "عامة";
  const changes = payment
    ? diff([
        ["الزبون", summary.client.name, target.client.name],
        ["المبلغ", payment.amount, amount],
        ["السلعة", itemName(payment.purchaseId, summary), itemName(v.purchaseId, target)],
        ["النوع", payment.kind, v.kind],
        ["التاريخ", `${payment.date} ${payment.time}`, `${v.date} ${v.time}`],
        ["ملاحظات", payment.notes, v.notes.trim()],
      ])
    : [];

  function save() {
    if (payment) {
      data.run(`تعديل دفعة · ${target.client.name}`, {
        type: "payment.update",
        id: payment.id,
        base: payment.updatedAt,
        patch: { clientId, purchaseId: v.purchaseId, amount, kind: v.kind, date: v.date, time: v.time, notes: v.notes.trim() },
      });
      return onClose();
    }
    const at = new Date().toISOString();
    const p: Payment = {
      id: newLedgerId("P"),
      clientId,
      purchaseId: v.purchaseId,
      date: v.date,
      time: v.time,
      amount,
      kind: v.kind,
      notes: v.notes.trim(),
      createdAt: at,
      updatedAt: at,
    };
    data.run(`دفعة ${money(amount)} · ${target.client.name}`, { type: "payment.add", payment: p, nextDueDate: after > 0 ? v.nextDueDate : "" });
    onDone?.(p.id);
  }

  if (confirm && payment) {
    const moved = clientId !== payment.clientId;
    return (
      <ConfirmEdit
        title={moved ? "تأكيد نقل الدفعة" : "تأكيد تعديل الدفعة"}
        who={moved ? `الدفعة ${payment.id} غادي تتنقل من ${summary.client.name} لـ ${target.client.name}.` : `${summary.client.name}: الدفعة ${payment.id}`}
        changes={changes}
        onBack={() => setConfirm(false)}
        onSave={save}
      />
    );
  }

  const items = target.items;
  return (
    <Modal
      title={editing ? "تعديل الدفعة" : `دفعة: ${summary.client.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="payment-form" className="btn primary">
            {editing ? "متابعة" : "سجل الدفعة"}
          </button>
        </>
      }
    >
      <form
        id="payment-form"
        className="form-grid"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!validate()) return;
          if (editing) return changes.length ? setConfirm(true) : onClose();
          save();
        }}
      >
        {editing && (
          <Field id="pa-client" label="الزبون" hint="بدلو إلا تسجلات الدفعة على زبون آخر بالغلط" wide>
            <ClientPicker id="pa-client" summaries={data.summaries} value={clientId} onChange={chooseClient} />
          </Field>
        )}
        <dl className="facts wide">
          <div>
            <dt>المتبقي دابا</dt>
            <dd>{money(target.remaining)}</dd>
          </div>
          <div>
            <dt>من بعد هاد الدفعة</dt>
            <dd className={after < 0 ? "danger-text" : after === 0 ? "ok-text" : ""}>{money(after)}</dd>
          </div>
        </dl>
        <Field id="pa-amount" label="المبلغ (درهم)" error={errors.amount} hint={after < 0 ? "⚠️ المبلغ كبر من المتبقي" : undefined}>
          <input id="pa-amount" inputMode="decimal" dir="ltr" value={v.amount} onChange={(e) => set("amount")(e.target.value)} autoFocus={!editing} />
        </Field>
        <Field id="pa-purchaseId" label="السلعة" hint="الأقدم لي باقي ما تخلصاتش، تقدر تبدلها">
          <select id="pa-purchaseId" value={v.purchaseId} onChange={(e) => set("purchaseId")(e.target.value)}>
            {items.map((i) => (
              <option key={i.purchase.id} value={i.purchase.id}>
                {i.purchase.item} · {displayDate(i.purchase.date)} · {i.remaining > 0 ? `باقي ${money(i.remaining)}` : "خالصة"}
              </option>
            ))}
            <option value="">عامة (بلا سلعة)</option>
          </select>
        </Field>
        <Field id="pa-date" label="تاريخ الأداء" error={errors.date} hint="بدلو إلا خلص فنهار آخر">
          <input id="pa-date" type="date" value={v.date} max={today} onChange={(e) => set("date")(e.target.value)} />
        </Field>
        <Field id="pa-time" label="الساعة" error={errors.time}>
          <input id="pa-time" type="time" value={v.time} onChange={(e) => set("time")(e.target.value)} />
        </Field>
        <Field id="pa-kind" label="النوع">
          <select id="pa-kind" value={v.kind} onChange={(e) => set("kind")(e.target.value)}>
            {PAYMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        {!editing && (
          <Field id="pa-next" label="الدفعة المقبلة" hint={after <= 0 ? "غادي يخلص كلشي" : summary.client.period ? `كل ${summary.client.period}` : undefined}>
            <input id="pa-next" type="date" value={after > 0 ? v.nextDueDate : ""} disabled={after <= 0} onChange={(e) => set("nextDueDate")(e.target.value)} />
          </Field>
        )}
        <Field id="pa-notes" label="ملاحظات" wide>
          <input id="pa-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
