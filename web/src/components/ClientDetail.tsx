"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { dueText, money, STATUS_LABEL } from "@/lib/format";
import { monthsToFinish, sortPayments, type Payment, type Purchase } from "@/lib/ledger";
import { displayDate, displayDateTime, installmentText } from "@/lib/receipt";
import { ClientInfoForm, InstallmentForm } from "./ClientForms";
import { Modal } from "./Modal";
import { PaymentForm, PurchaseForm } from "./MoneyForms";
import { SaleForm } from "./SaleForm";
import { ReceiptDialog } from "./ReceiptDialog";
import type { LedgerState } from "./useLedger";
import { Confirm } from "./ui";

type Sub =
  | { kind: "info" }
  | { kind: "installment"; reason?: string }
  | { kind: "purchase"; purchase?: Purchase }
  | { kind: "sale" }
  | { kind: "payment"; payment?: Payment }
  | { kind: "receipt"; mode: "payment" | "statement"; paymentId?: string; notice?: string }
  | { kind: "delete-purchase"; purchase: Purchase }
  | { kind: "delete-payment"; payment: Payment }
  | { kind: "delete-client" }
  | { kind: "archive" }
  | null;

export function ClientDetail({ data, clientId, onClose, onToast }: { data: LedgerState; clientId: string; onClose: () => void; onToast: (t: string) => void }) {
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);
  const s = data.summaries.find((x) => x.client.id === clientId);
  if (!s) {
    return (
      <Modal title="الزبون" onClose={onClose}>
        <p className="empty">هاد الزبون ما بقاش فاللائحة.</p>
      </Modal>
    );
  }
  const c = s.client;
  const months = monthsToFinish(s.remaining, c.installment, c.period);
  const payments = sortPayments(s.payments).reverse();
  const savedNote = data.online ? "" : " · محفوظ فالتيليفون";

  async function archiveNow() {
    setBusy(true);
    try {
      const { archived } = await apiFetch<{ archived: number }>("/api/archive", { method: "POST", body: { ids: [c.id] } });
      await data.refresh();
      onToast(archived ? `تأرشف ${c.name}` : "ما تأرشفش");
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Modal title={c.name} onClose={onClose} busy={busy}>
        <div className="detail-head">
          <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
          <span className="muted small" dir="ltr">
            {c.id}
          </span>
          {c.phone && (
            <a className="phone" href={`tel:${c.phone.replace(/\s/g, "")}`} dir="ltr">
              {c.phone}
            </a>
          )}
        </div>
        {c.notes && <p className="muted">{c.notes}</p>}

        <dl className="facts three">
          <div>
            <dt>المشتريات</dt>
            <dd>{money(s.total)}</dd>
          </div>
          <div>
            <dt>المدفوع</dt>
            <dd>{money(s.paid)}</dd>
          </div>
          <div>
            <dt>المتبقي</dt>
            <dd className={s.remaining > 0 ? "danger-text" : "ok-text"}>{s.remaining > 0 ? money(s.remaining) : "خالص ✓"}</dd>
          </div>
        </dl>

        {s.remaining > 0 && (
          <div className="installment-box">
            <div>
              <p>
                الطريطة: <strong>{installmentText(s) || "ما محددة"}</strong>
                {months ? <span className="muted"> · يخلص فـ {months} شهر تقريبا</span> : null}
              </p>
              <p className="muted small">
                الدفعة المقبلة: {c.nextDueDate ? `${displayDate(c.nextDueDate)} · ${dueText(c.nextDueDate, s.status, data.today)}` : "—"}
              </p>
            </div>
            <button type="button" className="btn small-btn" onClick={() => setSub({ kind: "installment" })}>
              بدل الطريطة
            </button>
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className="btn primary" onClick={() => setSub({ kind: "payment" })} disabled={!s.purchases.length}>
            دفعة
          </button>
          <button type="button" className="btn" onClick={() => setSub({ kind: "sale" })}>
            شراء جديد
          </button>
          <button type="button" className="btn" onClick={() => setSub({ kind: "receipt", mode: "statement" })}>
            كشف الحساب
          </button>
          <button type="button" className="btn" onClick={() => setSub({ kind: "info" })}>
            تعديل المعلومات
          </button>
        </div>

        <section className="detail-section" aria-label="المشتريات">
          <h3>المشتريات ({s.purchases.length})</h3>
          {s.items.length === 0 && <p className="muted small">ما شرا والو باقي.</p>}
          <ul className="rows">
            {s.items.map((it) => (
              <li key={it.purchase.id}>
                <div className="row-main">
                  <strong>{it.purchase.item}</strong>
                  <span className="muted small">
                    {displayDate(it.purchase.date)} · {money(it.purchase.price)}
                  </span>
                </div>
                <span className={`row-amount ${it.remaining > 0 ? "" : "ok-text"}`}>{it.remaining > 0 ? `باقي ${money(it.remaining)}` : "خالصة ✓"}</span>
                <div className="row-actions">
                  <button type="button" className="link-btn" onClick={() => setSub({ kind: "purchase", purchase: it.purchase })}>
                    تعديل
                  </button>
                  <button type="button" className="link-btn danger-text" onClick={() => setSub({ kind: "delete-purchase", purchase: it.purchase })}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="detail-section" aria-label="الدفعات">
          <h3>الدفعات ({payments.length})</h3>
          {payments.length === 0 && <p className="muted small">ما كاين حتى دفعة.</p>}
          <ul className="rows">
            {payments.map((p) => (
              <li key={p.id}>
                <div className="row-main">
                  <strong>{money(p.amount)}</strong>
                  <span className="muted small">
                    {displayDateTime(p.date, p.time)}
                    {p.kind === "تسبيق" ? " · تسبيق" : ""}
                    {p.purchaseId ? ` · ${s.purchases.find((x) => x.id === p.purchaseId)?.item ?? ""}` : ""}
                  </span>
                </div>
                <div className="row-actions">
                  <button type="button" className="link-btn" onClick={() => setSub({ kind: "receipt", mode: "payment", paymentId: p.id })}>
                    وصل
                  </button>
                  <button type="button" className="link-btn" onClick={() => setSub({ kind: "payment", payment: p })}>
                    تعديل / نقل
                  </button>
                  <button type="button" className="link-btn danger-text" onClick={() => setSub({ kind: "delete-payment", payment: p })}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {data.ledger && data.ledger.changes.some((x) => x.clientId === c.id) && (
          <section className="detail-section" aria-label="تغييرات الطريطة">
            <h3>تغييرات الطريطة</h3>
            <ul className="rows">
              {data.ledger.changes
                .filter((x) => x.clientId === c.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((x) => (
                  <li key={x.id}>
                    <div className="row-main">
                      <span>
                        {money(x.oldAmount)} ← <strong>{money(x.newAmount)}</strong> {x.newPeriod && `(${x.newPeriod})`}
                      </span>
                      <span className="muted small">
                        {displayDate(x.date)} · {x.reason}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <div className="detail-footer">
          {s.remaining <= 0 && s.purchases.length > 0 && (
            <button type="button" className="btn" disabled={!data.online || data.pendingCount > 0 || busy} onClick={() => setSub({ kind: "archive" })}>
              أرشفة
            </button>
          )}
          {s.purchases.length === 0 && s.payments.length === 0 && (
            <button type="button" className="btn danger-ghost" onClick={() => setSub({ kind: "delete-client" })}>
              حذف الزبون
            </button>
          )}
        </div>
      </Modal>

      {sub?.kind === "info" && <ClientInfoForm data={data} summary={s} onClose={() => setSub(null)} />}
      {sub?.kind === "installment" && <InstallmentForm data={data} summary={s} reason={sub.reason} onClose={() => setSub(null)} />}
      {sub?.kind === "purchase" && (
        <PurchaseForm
          data={data}
          summary={s}
          purchase={sub.purchase}
          onClose={() => setSub((x) => (x?.kind === "purchase" ? null : x))}
          onDone={(paymentId) => {
            onToast(`تزاد الشراء${savedNote}`);
            if (paymentId) setSub({ kind: "receipt", mode: "payment", paymentId, notice: "تسجل التسبيق" });
          }}
        />
      )}
      {sub?.kind === "sale" && (
        <Modal title={`شراء جديد: ${s.client.name}`} onClose={() => setSub(null)}>
          <SaleForm
            data={data}
            lockedClientId={s.client.id}
            onDone={(done) => {
              onToast(`تزاد الشراء${savedNote}`);
              setSub(done.paymentId ? { kind: "receipt", mode: "payment", paymentId: done.paymentId, notice: "تسجل التسبيق" } : null);
            }}
          />
        </Modal>
      )}
      {sub?.kind === "payment" && (
        <PaymentForm
          data={data}
          summary={s}
          payment={sub.payment}
          onClose={() => setSub(null)}
          onDone={(paymentId) => setSub({ kind: "receipt", mode: "payment", paymentId, notice: `تسجلات الدفعة${savedNote}` })}
        />
      )}
      {sub?.kind === "receipt" && <ReceiptDialog summary={s} mode={sub.mode} paymentId={sub.paymentId} notice={sub.notice} onClose={() => setSub(null)} />}
      {sub?.kind === "delete-purchase" && (
        <Confirm
          title="حذف السلعة"
          confirmLabel="إيه، احذف"
          danger
          onClose={() => setSub(null)}
          onConfirm={() => {
            data.run(`حذف سلعة · ${c.name}`, { type: "purchase.delete", id: sub.purchase.id });
            setSub(null);
          }}
        >
          <p className="lead">
            واش متأكد بغيتي تحذف <strong>{sub.purchase.item}</strong> ({money(sub.purchase.price)}) من حساب {c.name}؟
          </p>
          <p className="muted small">الدفعات ديالها كتبقى فالحساب كدفعات عامة.</p>
        </Confirm>
      )}
      {sub?.kind === "delete-payment" && (
        <Confirm
          title="حذف الدفعة"
          confirmLabel="إيه، احذف"
          danger
          onClose={() => setSub(null)}
          onConfirm={() => {
            data.run(`حذف دفعة · ${c.name}`, { type: "payment.delete", id: sub.payment.id });
            setSub(null);
          }}
        >
          <p className="lead">
            واش متأكد بغيتي تحذف الدفعة ديال <strong>{money(sub.payment.amount)}</strong> ({displayDateTime(sub.payment.date, sub.payment.time)})؟
          </p>
          <p className="muted small">إلا تسجلات على زبون آخر بالغلط، استعمل «تعديل / نقل» باش تنقلها بلا ما تحذفها.</p>
        </Confirm>
      )}
      {sub?.kind === "delete-client" && (
        <Confirm
          title="حذف الزبون"
          confirmLabel="إيه، احذف"
          danger
          onClose={() => setSub(null)}
          onConfirm={() => {
            data.run(`حذف · ${c.name}`, { type: "client.delete", id: c.id });
            onClose();
          }}
        >
          <p className="lead">
            واش متأكد بغيتي تحذف <strong>{c.name}</strong>؟
          </p>
        </Confirm>
      )}
      {sub?.kind === "archive" && (
        <Confirm
          title="أرشفة الزبون"
          confirmLabel="أرشف"
          onClose={() => setSub(null)}
          onConfirm={() => {
            setSub(null);
            void archiveNow();
          }}
        >
          <p className="lead">
            <strong>{c.name}</strong> خالص. غادي يتنقل للأرشيف مع المشتريات والدفعات ديالو.
          </p>
          <p className="muted small">تقدر تلقاه من بعد فـ «الأرشيف» وترجعو للائحة.</p>
        </Confirm>
      )}
    </>
  );
}
