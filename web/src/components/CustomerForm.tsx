"use client";

import { useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import {
  customerToInput,
  isManualPeriod,
  nextDateForPeriod,
  parseSum,
  PERIODS,
  stripStamps,
  validateInput,
  type Customer,
  type CustomerInput,
} from "@/lib/sheet-logic";
import { Modal } from "./Modal";

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  items: "",
  sell: "",
  buy: "",
  advance: "",
  period: "شهر",
  dueDate: "",
  installment: "",
};

const LABELS: Record<keyof CustomerInput, string> = {
  name: "اسم الزبون",
  phone: "رقم الهاتف",
  items: "السلع",
  sell: "ثمن البيع",
  buy: "ثمن الشراء",
  advance: "التسبيق / الدفعات",
  period: "مدة الطريطة",
  dueDate: "تاريخ الدفعة المقبلة",
  installment: "مبلغ الطريطة",
};

interface Props {
  customer?: Customer; // edit when set, add otherwise
  today: string;
  onClose: () => void;
  /** Saves the values (on the device first, then in the sheet). */
  onSubmit: (values: CustomerInput) => Promise<void>;
}

export function CustomerForm({ customer, today, onClose, onSubmit }: Props) {
  const editing = Boolean(customer);
  const [values, setValues] = useState<CustomerInput>(() =>
    customer ? customerToInput(customer) : { ...EMPTY, dueDate: nextDateForPeriod("شهر", today) },
  );
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const set = (key: keyof CustomerInput) => (value: string) => {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // Choosing a period fills the date, like the sheet does.
      if (key === "period" && !isManualPeriod(value)) next.dueDate = nextDateForPeriod(value, today) || v.dueDate;
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const changes = customer
    ? (Object.keys(LABELS) as (keyof CustomerInput)[]).filter((k) => values[k].trim() !== customerToInput(customer)[k].trim())
    : [];

  function check(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    const found = validateInput({ ...values, name: values.name.trim(), items: values.items.trim() });
    if (found.length) {
      setErrors(Object.fromEntries(found.map((x) => [x.field, x.message])));
      document.getElementById(`f-${found[0].field}`)?.focus();
      return;
    }
    if (editing) {
      if (!changes.length) return onClose();
      setStep("confirm");
    } else {
      void save();
    }
  }

  async function save() {
    setSaving(true);
    setServerError("");
    try {
      await onSubmit({ ...values, name: values.name.trim(), items: values.items.trim() });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
      setStep("form");
    } finally {
      setSaving(false);
    }
  }

  const remaining = parseSum(values.sell) - parseSum(values.advance);

  if (step === "confirm" && customer) {
    return (
      <Modal
        title="تأكيد التعديل"
        onClose={() => setStep("form")}
        busy={saving}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setStep("form")} disabled={saving}>
              رجوع
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={saving}>
              {saving ? "كيتسجل…" : "أكد التعديل"}
            </button>
          </>
        }
      >
        <p className="lead">
          غادي تبدل هاد المعلومات ديال <strong>{customer.name}</strong>:
        </p>
        <ul className="diff">
          {changes.map((k) => (
            <li key={k}>
              <span className="diff-label">{LABELS[k]}</span>
              <span className="diff-old">{displayValue(k, customerToInput(customer)[k])}</span>
              <span className="diff-arrow" aria-hidden="true">
                ←
              </span>
              <span className="diff-new">{displayValue(k, values[k])}</span>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      title={editing ? `تعديل: ${customer!.name}` : "زبون جديد"}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" form="customer-form" className="btn primary" disabled={saving}>
            {saving ? "كيتسجل…" : editing ? "متابعة" : "زيد الزبون"}
          </button>
        </>
      }
    >
      <form id="customer-form" className="form-grid" onSubmit={check} noValidate>
        {serverError && (
          <p className="alert error wide" role="alert">
            {serverError}
          </p>
        )}
        <Field id="name" label={LABELS.name} error={errors.name} wide>
          <input id="f-name" value={values.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" required />
        </Field>
        <Field id="phone" label={LABELS.phone} error={errors.phone} hint="مثلا 0661234567">
          <input id="f-phone" type="tel" inputMode="tel" dir="ltr" value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field id="items" label={LABELS.items} error={errors.items} hint="فرق بين السلع بـ +، مثلا: تلفاز + ثلاجة" wide>
          <input id="f-items" value={values.items} onChange={(e) => set("items")(e.target.value)} required />
        </Field>
        <Field id="sell" label={LABELS.sell} error={errors.sell} hint="درهم">
          <input id="f-sell" inputMode="decimal" dir="ltr" value={values.sell} onChange={(e) => set("sell")(e.target.value)} required />
        </Field>
        <Field id="buy" label={LABELS.buy} error={errors.buy} hint="باش يتحسب الربح">
          <input id="f-buy" inputMode="decimal" dir="ltr" value={values.buy} onChange={(e) => set("buy")(e.target.value)} />
        </Field>
        <Field
          id="advance"
          label={LABELS.advance}
          error={errors.advance}
          hint={editing ? "الدفعات الجديدة زيدها بزر «دفعة»" : "شحال خلص فالأول"}
          wide
        >
          <input id="f-advance" inputMode="decimal" dir="ltr" value={values.advance} onChange={(e) => set("advance")(e.target.value)} />
        </Field>
        <Field id="period" label={LABELS.period} error={errors.period}>
          <select id="f-period" value={values.period} onChange={(e) => set("period")(e.target.value)}>
            <option value="">—</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {values.period && !(PERIODS as readonly string[]).includes(values.period) && <option value={values.period}>{values.period}</option>}
          </select>
        </Field>
        <Field id="installment" label={LABELS.installment} error={errors.installment} hint="درهم">
          <input id="f-installment" inputMode="decimal" dir="ltr" value={values.installment} onChange={(e) => set("installment")(e.target.value)} />
        </Field>
        <Field id="dueDate" label={LABELS.dueDate} error={errors.dueDate} wide>
          <input id="f-dueDate" type="date" value={values.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
        </Field>
        <p className="form-total wide">
          المتبقي: <strong>{money(remaining)}</strong>
        </p>
      </form>
    </Modal>
  );
}

function displayValue(key: keyof CustomerInput, value: string): string {
  if (!value) return "—";
  return key === "items" || key === "advance" ? stripStamps(value) : value;
}

function Field({
  id,
  label,
  error,
  hint,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${wide ? " wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={`f-${id}`}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
