"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client";
import { money } from "@/lib/format";
import { isManualPeriod, suggestNextDueDate, type Customer } from "@/lib/sheet-logic";
import { Modal } from "./Modal";

interface Props {
  customer: Customer;
  today: string;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}

export function PaymentDialog({ customer, today, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState(() => {
    const n = Number(String(customer.installment).replace(",", "."));
    return n > 0 ? String(Math.min(n, customer.remaining)) : "";
  });
  const [paidDate, setPaidDate] = useState(today);
  const [nextDueDate, setNextDueDate] = useState(() => suggestNextDueDate(customer, today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amount.replace(",", "."));
  const after = customer.remaining - (Number.isFinite(value) ? value : 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(value > 0)) return setError("دخل المبلغ لي خلص الزبون");
    if (!paidDate) return setError("دخل تاريخ الأداء");
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch<{ customer: Customer }>(`/api/customers/${customer.row}/payments`, {
        method: "POST",
        body: { amount: value, paidDate, nextDueDate: after > 0 ? nextDueDate : "", expected: customer.expected },
      });
      onSaved(data.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`دفعة: ${customer.name}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" form="payment-form" className="btn primary" disabled={saving}>
            {saving ? "كيتسجل…" : "سجل الدفعة"}
          </button>
        </>
      }
    >
      <form id="payment-form" className="form-grid" onSubmit={submit} noValidate>
        <dl className="facts wide">
          <div>
            <dt>المتبقي دابا</dt>
            <dd>{money(customer.remaining)}</dd>
          </div>
          <div>
            <dt>من بعد هاد الدفعة</dt>
            <dd className={after < 0 ? "danger-text" : after === 0 ? "ok-text" : ""}>{money(after)}</dd>
          </div>
        </dl>
        {error && (
          <p className="alert error wide" role="alert">
            {error}
          </p>
        )}
        <div className="field wide">
          <label htmlFor="p-amount">المبلغ (درهم)</label>
          <input id="p-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          {after < 0 && <span className="field-error">المبلغ كبر من المتبقي</span>}
        </div>
        <div className="field">
          <label htmlFor="p-date">تاريخ الأداء</label>
          <input id="p-date" type="date" value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)} />
          <span className="field-hint">بدلو إلا خلص فنهار آخر</span>
        </div>
        <div className="field">
          <label htmlFor="p-next">الدفعة المقبلة</label>
          <input
            id="p-next"
            type="date"
            value={after > 0 ? nextDueDate : ""}
            onChange={(e) => setNextDueDate(e.target.value)}
            disabled={after <= 0}
          />
          <span className="field-hint">
            {after <= 0 ? "غادي يخلص كلشي" : isManualPeriod(customer.period) || !customer.period ? "اختار التاريخ" : `كل ${customer.period}`}
          </span>
        </div>
      </form>
    </Modal>
  );
}
