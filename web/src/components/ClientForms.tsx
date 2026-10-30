"use client";

import { useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import { monthsToFinish, newLedgerId, nowParts, type Client, type ClientSummary, type Payment, type Purchase } from "@/lib/ledger";
import { formatMoroccoPhone, isISODate, isManualPeriod, isValidPhone, nextDateForPeriod, PERIODS } from "@/lib/sheet-logic";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { ChangeList, diff, Field, parseAmount } from "./ui";

type Errors = Record<string, string>;

function PeriodSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      {value && !(PERIODS as readonly string[]).includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

function phoneError(phone: string): string {
  return phone.trim() && !isValidPhone(formatMoroccoPhone(phone)) ? "رقم الهاتف غير صحيح" : "";
}

// ---------------------------------------------------------------- new customer

export function NewClientForm({
  data,
  onClose,
  onDone,
}: {
  data: LedgerState;
  onClose: () => void;
  onDone: (clientId: string, paymentId?: string) => void;
}) {
  const today = data.today;
  const [v, setV] = useState({
    name: "",
    phone: "",
    notes: "",
    item: "",
    price: "",
    cost: "",
    date: today,
    advance: "",
    installment: "",
    period: "شهر",
    nextDueDate: nextDateForPeriod("شهر", today),
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof v) => (value: string) => {
    setV((old) => {
      const next = { ...old, [k]: value };
      if (k === "period" && !isManualPeriod(value)) next.nextDueDate = nextDateForPeriod(value, old.date || today) || old.nextDueDate;
      return next;
    });
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const samePhone = v.phone.trim() && isValidPhone(formatMoroccoPhone(v.phone))
    ? data.summaries.find((s) => formatMoroccoPhone(s.client.phone) === formatMoroccoPhone(v.phone))
    : undefined;
  const price = parseAmount(v.price || "0");
  const advance = parseAmount(v.advance || "0");
  const remaining = (price || 0) - (advance || 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    if (!v.name.trim()) err.name = "الاسم ضروري";
    if (phoneError(v.phone)) err.phone = phoneError(v.phone);
    if (v.item.trim() && !(price > 0)) err.price = "ثمن البيع ضروري";
    if (!v.item.trim() && v.price) err.item = "السلعة ضرورية";
    if (v.cost && !(parseAmount(v.cost) >= 0)) err.cost = "المبلغ غير صحيح";
    if (v.advance && !(advance >= 0)) err.advance = "المبلغ غير صحيح";
    if (advance > price) err.advance = "التسبيق كبر من الثمن";
    if (v.installment && !(parseAmount(v.installment) >= 0)) err.installment = "المبلغ غير صحيح";
    if (!isISODate(v.date)) err.date = "التاريخ ضروري";
    setErrors(err);
    const first = Object.keys(err)[0];
    if (first) return document.getElementById(`n-${first}`)?.focus();

    const at = new Date().toISOString();
    const client: Client = {
      id: newLedgerId("C"),
      name: v.name.trim(),
      phone: v.phone.trim(),
      installment: parseAmount(v.installment || "0") || 0,
      period: v.period,
      nextDueDate: v.nextDueDate,
      notes: v.notes.trim(),
      createdAt: at,
      updatedAt: at,
    };
    const ops: Parameters<LedgerState["run"]>[1][] = [{ type: "client.add", client }];
    let paymentId: string | undefined;
    if (v.item.trim()) {
      const purchase: Purchase = {
        id: newLedgerId("S"),
        clientId: client.id,
        date: v.date,
        item: v.item.trim(),
        price,
        cost: parseAmount(v.cost || "0") || 0,
        notes: "",
        createdAt: at,
        updatedAt: at,
      };
      ops.push({ type: "purchase.add", purchase });
      if (advance > 0) {
        const payment: Payment = {
          id: newLedgerId("P"),
          clientId: client.id,
          purchaseId: purchase.id,
          date: v.date,
          time: nowParts().time,
          amount: advance,
          kind: "تسبيق",
          notes: "",
          createdAt: at,
          updatedAt: at,
        };
        paymentId = payment.id;
        ops.push({ type: "payment.add", payment });
      }
    }
    data.run(`زبون جديد · ${client.name}`, ...ops);
    onDone(client.id, paymentId);
  }

  return (
    <Modal
      title="زبون جديد"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="new-client" className="btn primary">
            زيد الزبون
          </button>
        </>
      }
    >
      <form id="new-client" className="form-grid" onSubmit={submit} noValidate>
        <Field id="n-name" label="اسم الزبون" error={errors.name} hint="مثلا: محمد صاحب سمير لي خدام فالكابلاج" wide>
          <input id="n-name" value={v.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field id="n-phone" label="رقم الهاتف" error={errors.phone} hint={samePhone ? `⚠️ هاد الرقم عند: ${samePhone.client.name}` : "مثلا 0661234567"}>
          <input id="n-phone" type="tel" inputMode="tel" dir="ltr" value={v.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field id="n-notes" label="ملاحظات">
          <input id="n-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>

        <h3 className="form-section wide">أول شراء</h3>
        <Field id="n-item" label="السلعة" error={errors.item} hint="خليها خاوية إلا ما شرا والو دابا" wide>
          <input id="n-item" value={v.item} onChange={(e) => set("item")(e.target.value)} />
        </Field>
        <Field id="n-price" label="ثمن البيع" error={errors.price} hint="درهم">
          <input id="n-price" inputMode="decimal" dir="ltr" value={v.price} onChange={(e) => set("price")(e.target.value)} />
        </Field>
        <Field id="n-cost" label="ثمن الشراء" error={errors.cost} hint="باش يتحسب الربح">
          <input id="n-cost" inputMode="decimal" dir="ltr" value={v.cost} onChange={(e) => set("cost")(e.target.value)} />
        </Field>
        <Field id="n-advance" label="التسبيق" error={errors.advance} hint="شحال خلص دابا">
          <input id="n-advance" inputMode="decimal" dir="ltr" value={v.advance} onChange={(e) => set("advance")(e.target.value)} />
        </Field>
        <Field id="n-date" label="تاريخ الشراء" error={errors.date}>
          <input id="n-date" type="date" value={v.date} max={today} onChange={(e) => set("date")(e.target.value)} />
        </Field>

        <h3 className="form-section wide">الطريطة</h3>
        <Field id="n-installment" label="مبلغ الطريطة" error={errors.installment} hint="درهم">
          <input id="n-installment" inputMode="decimal" dir="ltr" value={v.installment} onChange={(e) => set("installment")(e.target.value)} />
        </Field>
        <Field id="n-period" label="كل">
          <PeriodSelect id="n-period" value={v.period} onChange={set("period")} />
        </Field>
        <Field id="n-next" label="الدفعة المقبلة" wide>
          <input id="n-next" type="date" value={v.nextDueDate} onChange={(e) => set("nextDueDate")(e.target.value)} />
        </Field>
        {remaining > 0 && (
          <p className="form-total wide">
            الكريدي: <strong>{money(remaining)}</strong>
            {(() => {
              const m = monthsToFinish(remaining, parseAmount(v.installment || "0") || 0, v.period);
              return m ? ` · غادي يخلص فـ ${m} شهر تقريبا` : "";
            })()}
          </p>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- edit customer info

export function ClientInfoForm({ data, summary, onClose }: { data: LedgerState; summary: ClientSummary; onClose: () => void }) {
  const c = summary.client;
  const [v, setV] = useState({ name: c.name, phone: c.phone, notes: c.notes, nextDueDate: c.nextDueDate });
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const changes = diff([
    ["الاسم", c.name, v.name.trim()],
    ["الهاتف", c.phone, v.phone.trim()],
    ["ملاحظات", c.notes, v.notes.trim()],
    ["الدفعة المقبلة", c.nextDueDate, v.nextDueDate],
  ]);

  function check(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    if (!v.name.trim()) err.name = "الاسم ضروري";
    if (phoneError(v.phone)) err.phone = phoneError(v.phone);
    setErrors(err);
    if (Object.keys(err).length) return;
    if (!changes.length) return onClose();
    setConfirm(true);
  }

  function save() {
    data.run(`تعديل · ${v.name.trim()}`, {
      type: "client.update",
      id: c.id,
      base: c.updatedAt,
      patch: { name: v.name.trim(), phone: v.phone.trim(), notes: v.notes.trim(), nextDueDate: v.nextDueDate },
    });
    onClose();
  }

  if (confirm) {
    return (
      <Modal
        title="تأكيد التعديل"
        onClose={() => setConfirm(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              رجوع
            </button>
            <button type="button" className="btn primary" onClick={save}>
              أكد التعديل
            </button>
          </>
        }
      >
        <p className="lead">
          غادي تبدل هاد المعلومات ديال <strong>{c.name}</strong>:
        </p>
        <ChangeList changes={changes} />
      </Modal>
    );
  }

  return (
    <Modal
      title={`تعديل: ${c.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="client-info" className="btn primary">
            متابعة
          </button>
        </>
      }
    >
      <form id="client-info" className="form-grid" onSubmit={check} noValidate>
        <Field id="ci-name" label="اسم الزبون" error={errors.name} wide>
          <input id="ci-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field id="ci-phone" label="رقم الهاتف" error={errors.phone}>
          <input id="ci-phone" type="tel" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field id="ci-next" label="الدفعة المقبلة">
          <input id="ci-next" type="date" value={v.nextDueDate} onChange={(e) => setV({ ...v, nextDueDate: e.target.value })} />
        </Field>
        <Field id="ci-notes" label="ملاحظات" wide>
          <input id="ci-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- instalment change

/** Change the agreed instalment; the old and new values and the reason go to "تغييرات الطريطة". */
export function InstallmentForm({
  data,
  summary,
  reason: initialReason = "",
  onClose,
}: {
  data: LedgerState;
  summary: ClientSummary;
  reason?: string;
  onClose: () => void;
}) {
  const c = summary.client;
  const [amount, setAmount] = useState(c.installment ? String(c.installment) : "");
  const [period, setPeriod] = useState(c.period || "شهر");
  const [nextDueDate, setNextDueDate] = useState(c.nextDueDate);
  const [reason, setReason] = useState(initialReason);
  const [errors, setErrors] = useState<Errors>({});
  const value = parseAmount(amount || "0");
  const months = monthsToFinish(summary.remaining, value || 0, period);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    if (!(value >= 0)) err.amount = "المبلغ غير صحيح";
    if (!reason.trim()) err.reason = "كتب علاش تبدلات الطريطة";
    setErrors(err);
    if (Object.keys(err).length) return;
    if (value === c.installment && period === c.period && nextDueDate === c.nextDueDate) return onClose();
    data.run(`تبديل الطريطة · ${c.name}`, {
      type: "client.installment",
      id: c.id,
      base: c.updatedAt,
      nextDueDate,
      change: {
        id: newLedgerId("T"),
        clientId: c.id,
        date: nowParts().date,
        oldAmount: c.installment,
        newAmount: value,
        oldPeriod: c.period,
        newPeriod: period,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    onClose();
  }

  return (
    <Modal
      title={`الطريطة: ${c.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="installment-form" className="btn primary">
            سجل
          </button>
        </>
      }
    >
      <form id="installment-form" className="form-grid" onSubmit={submit} noValidate>
        <dl className="facts wide">
          <div>
            <dt>المتبقي</dt>
            <dd>{money(summary.remaining)}</dd>
          </div>
          <div>
            <dt>الطريطة دابا</dt>
            <dd>{c.installment ? `${money(c.installment)} · ${c.period}` : "—"}</dd>
          </div>
        </dl>
        <Field id="i-amount" label="الطريطة الجديدة" error={errors.amount} hint="درهم">
          <input id="i-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field id="i-period" label="كل">
          <PeriodSelect id="i-period" value={period} onChange={setPeriod} />
        </Field>
        <Field id="i-next" label="الدفعة المقبلة" wide>
          <input id="i-next" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        </Field>
        <Field id="i-reason" label="السبب" error={errors.reason} hint="مثلا: شرا ماشينة الصابون" wide>
          <input id="i-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {months !== null && summary.remaining > 0 && <p className="form-total wide">بهاد الطريطة غادي يخلص فـ {months} شهر تقريبا.</p>}
      </form>
    </Modal>
  );
}
