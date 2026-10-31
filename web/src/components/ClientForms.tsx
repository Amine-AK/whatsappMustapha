"use client";

import { useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import { monthsToFinish, newLedgerId, nowParts, type Client, type ClientSummary } from "@/lib/ledger";
import { formatMoroccoPhone, isValidPhone, PERIODS } from "@/lib/sheet-logic";
import { Modal } from "./Modal";
import { SaleForm } from "./SaleForm";
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

/**
 * New customer in 3 short steps: name + phone → "add a sale now?" → the sale
 * (same form as the البيع tab, credit for this customer, with the instalment).
 */
export function NewClientForm({
  data,
  onClose,
  onDone,
}: {
  data: LedgerState;
  onClose: () => void;
  onDone: (clientId: string, paymentId?: string) => void;
}) {
  const [v, setV] = useState({ name: "", phone: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState<"info" | "ask" | "sale">("info");
  const [client, setClient] = useState<Client | null>(null);
  const set = (k: keyof typeof v) => (value: string) => {
    setV((old) => ({ ...old, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const samePhone = v.phone.trim() && isValidPhone(formatMoroccoPhone(v.phone))
    ? data.summaries.find((s) => formatMoroccoPhone(s.client.phone) === formatMoroccoPhone(v.phone))
    : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    if (!v.name.trim()) err.name = "الاسم ضروري";
    if (phoneError(v.phone)) err.phone = phoneError(v.phone);
    setErrors(err);
    const first = Object.keys(err)[0];
    if (first) return document.getElementById(`n-${first}`)?.focus();
    const at = new Date().toISOString();
    // The instalment is set with the first sale.
    const c: Client = { id: newLedgerId("C"), name: v.name.trim(), phone: v.phone.trim(), installment: 0, period: "شهر", nextDueDate: "", notes: "", createdAt: at, updatedAt: at };
    data.run(`زبون جديد · ${c.name}`, { type: "client.add", client: c });
    setClient(c);
    setStep("ask");
  }

  if (step === "sale" && client) {
    return (
      <Modal title={`بيعة لـ ${client.name}`} onClose={() => onDone(client.id)}>
        <SaleForm data={data} lockedClientId={client.id} onDone={(done) => onDone(client.id, done.paymentId)} />
      </Modal>
    );
  }

  if (step === "ask" && client) {
    return (
      <Modal
        title="زبون جديد"
        onClose={() => onDone(client.id)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => onDone(client.id)}>
              لا، من بعد
            </button>
            <button type="button" className="btn primary" onClick={() => setStep("sale")} autoFocus>
              🛒 إيه، زيد بيعة
            </button>
          </>
        }
      >
        <div className="done-step">
          <p className="done-check" aria-hidden="true">
            ✅
          </p>
          <p className="lead">
            تزاد <strong>{client.name}</strong>
            {client.phone && (
              <>
                {" "}
                · <bdi dir="ltr">{client.phone}</bdi>
              </>
            )}
          </p>
          <p className="done-question">واش بغيتي تزيد ليه بيعة دابا؟</p>
          <p className="muted small">إلا ما شرا والو دابا، غادي تلقاه فـ «الكل» حتى يشري شي حاجة.</p>
        </div>
      </Modal>
    );
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
            حفظ الزبون
          </button>
        </>
      }
    >
      <form id="new-client" className="form-grid one-col" onSubmit={submit} noValidate>
        <Field id="n-name" label="اسم الزبون" error={errors.name} hint="مثلا: محمد صاحب سمير لي خدام فالكابلاج">
          <input id="n-name" value={v.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field id="n-phone" label="رقم الهاتف" error={errors.phone} hint={samePhone ? `⚠️ هاد الرقم عند: ${samePhone.client.name}` : "مثلا 0661234567"}>
          <input id="n-phone" type="tel" inputMode="tel" dir="ltr" value={v.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
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
