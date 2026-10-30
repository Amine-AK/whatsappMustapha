"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import { nowParts, sortPayments, type ClientSummary } from "@/lib/ledger";
import { displayDateTime, paymentReceipt, SHOP, statement, type PaymentReceipt, type Statement } from "@/lib/receipt";
import { Modal } from "./Modal";

type Paper = "58" | "80";
const PAPER_KEY = "receipt-paper";
const SHORT_LIST = 12;

function readPaper(): Paper {
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}

interface Props {
  summary: ClientSummary;
  /** "statement" = whole account; otherwise a payment receipt. */
  mode: "payment" | "statement";
  paymentId?: string;
  notice?: string;
  onClose: () => void;
}

export function ReceiptDialog({ summary, mode: initialMode, paymentId, notice, onClose }: Props) {
  const payments = sortPayments(summary.payments);
  const [mode, setMode] = useState(initialMode);
  const [selected, setSelected] = useState(paymentId ?? payments[payments.length - 1]?.id ?? "");
  const [paper, setPaper] = useState<Paper>("80");
  const [short, setShort] = useState(payments.length > SHORT_LIST);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPaper(readPaper());
    setMounted(true);
  }, []);

  function choosePaper(p: Paper) {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {}
  }

  const payment = payments.find((p) => p.id === selected);
  const now = nowParts();
  const content =
    mode === "statement"
      ? { kind: "statement" as const, data: statement(summary, displayDateTime(now.date, now.time), short ? SHORT_LIST : 0) }
      : payment
        ? { kind: "payment" as const, data: paymentReceipt(summary, payment) }
        : null;

  return (
    <>
      <Modal
        title={mode === "statement" ? "كشف الحساب" : "وصل الأداء"}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              سد
            </button>
            <button type="button" className="btn primary" onClick={() => window.print()} disabled={!content}>
              🖨️ طبع
            </button>
          </>
        }
      >
        {notice && <p className="alert info">{notice}</p>}
        <div className="segmented wide-seg" role="group" aria-label="نوع الوصل">
          <button type="button" className={mode === "payment" ? "on" : ""} aria-pressed={mode === "payment"} onClick={() => setMode("payment")} disabled={!payments.length}>
            وصل دفعة
          </button>
          <button type="button" className={mode === "statement" ? "on" : ""} aria-pressed={mode === "statement"} onClick={() => setMode("statement")}>
            كشف الحساب
          </button>
        </div>
        <div className="receipt-options">
          {mode === "payment" && payments.length > 0 && (
            <label className="field">
              <span>الدفعة</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {[...payments].reverse().map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayDateTime(p.date, p.time)} · {money(p.amount)}
                    {p.kind === "تسبيق" ? " · تسبيق" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "statement" && payments.length > SHORT_LIST && (
            <label className="check">
              <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} />
              غير آخر {SHORT_LIST} دفعة (من {payments.length})
            </label>
          )}
          <div className="field">
            <span>عرض الورق</span>
            <div className="segmented" role="group" aria-label="عرض الورق">
              {(["58", "80"] as Paper[]).map((p) => (
                <button key={p} type="button" dir="ltr" className={paper === p ? "on" : ""} aria-pressed={paper === p} onClick={() => choosePaper(p)}>
                  {p} mm
                </button>
              ))}
            </div>
          </div>
        </div>
        {!content ? (
          <p className="empty">هاد الزبون ما عندو حتى دفعة.</p>
        ) : (
          <div className="receipt-preview">
            <Ticket content={content} paper={paper} />
          </div>
        )}
      </Modal>
      {/* Printed copy: the only thing on the page when printing. */}
      {mounted && content && createPortal(<div id="print-root"><Ticket content={content} paper={paper} /></div>, document.body)}
    </>
  );
}

type Content = { kind: "payment"; data: PaymentReceipt } | { kind: "statement"; data: Statement };

function Line({ label, value, strong, ltr }: { label: string; value: string; strong?: boolean; ltr?: boolean }) {
  return (
    <p className={`ticket-line${strong ? " ticket-strong" : ""}`}>
      <span>{label}</span>
      <span dir={ltr ? "ltr" : undefined}>{value}</span>
    </p>
  );
}

function Ticket({ content, paper }: { content: Content; paper: Paper }) {
  const r = content.data;
  return (
    <article className={`ticket w${paper}`} dir="rtl" lang="ar">
      <header className="ticket-head">
        <p className="ticket-shop">{SHOP.name}</p>
        <p dir="ltr">{SHOP.phone}</p>
      </header>
      <hr />
      {content.kind === "payment" ? <PaymentBody r={content.data} /> : <StatementBody r={content.data} />}
      <hr />
      <Line label="الثمن الإجمالي" value={money(r.total)} />
      <Line label="مجموع المدفوع" value={money(content.kind === "payment" ? content.data.paidToDate : content.data.paid)} />
      <Line label="المتبقي" value={r.remaining > 0 ? money(r.remaining) : "خالص ✓"} strong />
      {r.nextDueDate && <Line label="الدفعة المقبلة" value={displayDateTime(r.nextDueDate)} ltr />}
      {r.installment && <Line label="الطريطة" value={r.installment} />}
      <hr />
      <p className="ticket-sign">توقيع البائع: ..................</p>
      <p className="ticket-thanks">{SHOP.thanks}</p>
    </article>
  );
}

function Who({ name, id, phone }: { name: string; id: string; phone: string }) {
  return (
    <>
      <Line label="الزبون" value={name} />
      <Line label="رقم الزبون" value={id} ltr />
      {phone && <Line label="الهاتف" value={phone} ltr />}
    </>
  );
}

function PaymentBody({ r }: { r: PaymentReceipt }) {
  return (
    <>
      <div className="ticket-title">
        <strong>وصل الأداء</strong>
        <span dir="ltr">N° {r.number}</span>
      </div>
      <Line label="التاريخ" value={r.date} ltr />
      <hr />
      <Who name={r.customer} id={r.clientId} phone={r.phone} />
      {r.item && <Line label="السلعة" value={r.item} />}
      <hr />
      <div className="ticket-amount">
        <span>{r.label}</span>
        <strong>{money(r.amount)}</strong>
      </div>
    </>
  );
}

function StatementBody({ r }: { r: Statement }) {
  return (
    <>
      <div className="ticket-title">
        <strong>كشف الحساب</strong>
        <span dir="ltr">{r.printedAt}</span>
      </div>
      <hr />
      <Who name={r.customer} id={r.clientId} phone={r.phone} />
      <hr />
      <p className="ticket-section">المشتريات</p>
      <table className="ticket-table">
        <tbody>
          {r.items.map((i, k) => (
            <tr key={k}>
              <td dir="ltr" className="t-date">
                {i.date}
              </td>
              <td>
                {i.item}
                <span className="t-sub">{i.remaining > 0 ? `باقي ${money(i.remaining)}` : "خالصة ✓"}</span>
              </td>
              <td className="t-num">{money(i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <p className="ticket-section">الدفعات</p>
      {r.hiddenPayments > 0 && (
        <p className="ticket-line t-sub">
          <span>{r.hiddenPayments} دفعة قبل</span>
          <span>{money(r.hiddenTotal)}</span>
        </p>
      )}
      <table className="ticket-table">
        <tbody>
          {r.payments.map((p, k) => (
            <tr key={k}>
              <td dir="ltr" className="t-date">
                {p.date}
              </td>
              <td>{p.label}</td>
              <td className="t-num">{money(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
