"use client";

import { useMemo, useState, type FormEvent } from "react";
import { money } from "@/lib/format";
import { newLedgerId, nowParts } from "@/lib/ledger";
import { displayDate, displayDateTime } from "@/lib/receipt";
import { cashDay, currentSeller, round2 } from "@/lib/shop";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { Field, parseAmount } from "./ui";

/**
 * The day's cash drawer (الصندوق اليومي): what should be in it, and the closing
 * count that the owner can check from anywhere.
 * Expected = cash sales + credit advances + instalments − shop expenses.
 */
export function CaisseView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const [date, setDate] = useState(data.today);
  const [closing, setClosing] = useState(false);
  const day = useMemo(() => cashDay(ledger, date), [ledger, date]);
  const names = useMemo(() => new Map(ledger.clients.map((c) => [c.id, c.name])), [ledger.clients]);
  const last = day.closings[day.closings.length - 1];
  const t = day.totals;

  const rows = [
    ...day.cashSales.map((s) => ({ id: s.id, time: s.time, label: `${s.quantity > 1 ? `${s.quantity}× ` : ""}${s.item}`, sub: `بيع كاش${s.seller ? ` · ${s.seller}` : ""}`, amount: s.sellPrice })),
    ...day.advances.map((p) => ({ id: p.id, time: p.time, label: names.get(p.clientId) ?? "—", sub: "تسبيق كريدي", amount: p.amount })),
    ...day.installments.map((p) => ({ id: p.id, time: p.time, label: names.get(p.clientId) ?? "—", sub: "دفعة طريطة", amount: p.amount })),
  ].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <div className="view">
      <div className="search-row">
        <label className="field caisse-date">
          <span className="visually-hidden">النهار</span>
          <input type="date" value={date} max={data.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {date !== data.today && (
          <button type="button" className="btn" onClick={() => setDate(data.today)}>
            اليوم
          </button>
        )}
      </div>

      <section className="caisse-total" aria-label="فالصندوق">
        <span className="muted">{date === data.today ? "دخل للصندوق اليوم" : `دخل للصندوق نهار ${displayDate(date)}`}</span>
        <strong>{money(t.incoming)}</strong>
        {last && (
          <span className="small">
            تسد على {last.time} · المصاريف {money(last.expenses)} · المتوقع فالقجر <strong>{money(last.expected)}</strong>
          </span>
        )}
      </section>

      <section className="summary" aria-label="التفصيل">
        <div className="stat">
          <span className="stat-label">💵 مبيعات الكاش</span>
          <span className="stat-value">{money(t.cashSales)}</span>
          <span className="stat-sub">{day.cashSales.length} بيعة</span>
        </div>
        <div className="stat">
          <span className="stat-label">📒 تسبيقات الكريدي</span>
          <span className="stat-value">{money(t.advances)}</span>
          <span className="stat-sub">{day.advances.length} تسبيق</span>
        </div>
        <div className="stat">
          <span className="stat-label">🔁 دفعات الطريطات</span>
          <span className="stat-value">{money(t.installments)}</span>
          <span className="stat-sub">{day.installments.length} دفعة</span>
        </div>
      </section>

      <div className="actions-row in-flow">
        <button type="button" className="btn primary" onClick={() => setClosing(true)}>
          🔒 إغلاق الصندوق
        </button>
      </div>

      {day.backdated.length > 0 && (
        <div className="alert warn" role="note">
          <p>
            <strong>{day.backdated.length}</strong> عملية تسجلات هاد النهار بتاريخ قديم (ما محسوباش هنا):
          </p>
          <ul className="plain-list small">
            {day.backdated.map((b) => (
              <li key={b.id}>
                {b.label} · {money(b.amount)} · بتاريخ {displayDate(b.date)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {day.closings.length > 0 && (
        <section aria-label="الإغلاقات">
          <h2 className="section-title">الإغلاقات</h2>
          <ul className="closing-list">
            {[...day.closings].reverse().map((k) => {
              const diff = k.counted === null ? null : round2(k.counted - k.expected);
              return (
                <li key={k.id} className="closing">
                  <p>
                    <strong>{k.time}</strong>
                    {k.clerk ? ` · ${k.clerk}` : ""}
                  </p>
                  <p className="small">
                    دخل {money(round2(k.cashSales + k.advances + k.installments))} − مصاريف {money(k.expenses)}
                    {k.expensesNote ? ` (${k.expensesNote})` : ""} = المتوقع <strong>{money(k.expected)}</strong>
                  </p>
                  {k.counted !== null && (
                    <p className={`small ${diff === 0 ? "ok-text" : "danger-text"}`}>
                      تحسب: {money(k.counted)} · {diff === 0 ? "مضبوط ✓" : `الفرق: ${diff! > 0 ? "+" : ""}${money(diff!)}`}
                    </p>
                  )}
                  {k.notes && <p className="muted small">{k.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="العمليات">
        <h2 className="section-title">العمليات ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="empty small">ما دخل حتى درهم هاد النهار.</p>
        ) : (
          <ul className="cash-list">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="muted small" dir="ltr">
                  {r.time}
                </span>
                <span className="cash-what">
                  <strong>{r.label}</strong>
                  <span className="muted small">{r.sub}</span>
                </span>
                <span className="amount">{money(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closing && (
        <CloseForm
          data={data}
          date={date}
          totals={t}
          onClose={() => setClosing(false)}
          onSaved={() => {
            setClosing(false);
            onToast("تسد الصندوق ✓");
          }}
        />
      )}
    </div>
  );
}

function CloseForm({
  data,
  date,
  totals,
  onClose,
  onSaved,
}: {
  data: LedgerState;
  date: string;
  totals: ReturnType<typeof cashDay>["totals"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({ expenses: "", expensesNote: "", counted: "", notes: "" });
  const [error, setError] = useState("");
  const expenses = parseAmount(v.expenses || "0");
  const expected = round2(totals.incoming - (expenses || 0));
  const counted = v.counted.trim() ? parseAmount(v.counted) : null;
  const diff = counted !== null && Number.isFinite(counted) ? round2(counted - expected) : null;
  const set = (k: keyof typeof v) => (value: string) => setV((o) => ({ ...o, [k]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!(expenses >= 0)) return setError("المصاريف غير صحيحة");
    if (counted !== null && !(counted >= 0)) return setError("المبلغ المحسوب غير صحيح");
    const now = nowParts();
    data.run(`إغلاق الصندوق · ${displayDateTime(date, now.time)}`, {
      type: "caisse.close",
      close: {
        id: newLedgerId("K"),
        date,
        time: now.time,
        clerk: currentSeller(),
        cashSales: totals.cashSales,
        advances: totals.advances,
        installments: totals.installments,
        expenses: expenses || 0,
        expensesNote: v.expensesNote.trim(),
        expected,
        counted,
        notes: v.notes.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    onSaved();
  }

  return (
    <Modal
      title={`إغلاق الصندوق · ${displayDate(date)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="close-form" className="btn primary">
            🔒 سد الصندوق
          </button>
        </>
      }
    >
      <form id="close-form" className="form-grid" noValidate onSubmit={submit}>
        <dl className="caisse-sum wide">
          <dt>مبيعات الكاش</dt>
          <dd>{money(totals.cashSales)}</dd>
          <dt>تسبيقات الكريدي</dt>
          <dd>{money(totals.advances)}</dd>
          <dt>دفعات الطريطات</dt>
          <dd>{money(totals.installments)}</dd>
          <dt>− المصاريف</dt>
          <dd>{money(expenses || 0)}</dd>
          <dt className="strong">الصافي فالقجر</dt>
          <dd className="strong">{money(expected)}</dd>
        </dl>
        <Field id="cl-expenses" label="مصاريف المحل" hint="درهم (قهوة، نقل، كرا…)">
          <input id="cl-expenses" inputMode="decimal" dir="ltr" value={v.expenses} onChange={(e) => set("expenses")(e.target.value)} />
        </Field>
        <Field id="cl-expensesNote" label="تفاصيل المصاريف" wide>
          <input id="cl-expensesNote" value={v.expensesNote} onChange={(e) => set("expensesNote")(e.target.value)} />
        </Field>
        <Field id="cl-counted" label="شحال كاين فالقجر بالضبط" hint="حسب الفلوس. خليه خاوي إلا ما حسبتيش" wide>
          <input id="cl-counted" inputMode="decimal" dir="ltr" value={v.counted} onChange={(e) => set("counted")(e.target.value)} />
        </Field>
        {diff !== null && (
          <p className={`alert ${diff === 0 ? "info" : "warn"} wide`}>{diff === 0 ? "مضبوط ✓" : diff > 0 ? `كاين زايد ${money(diff)}` : `ناقص ${money(-diff)}`}</p>
        )}
        <Field id="cl-notes" label="ملاحظات" wide>
          <input id="cl-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
        {error && (
          <p className="alert error wide" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
