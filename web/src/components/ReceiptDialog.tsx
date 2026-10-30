"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import { buildReceipt, SHOP, type Receipt } from "@/lib/receipt";
import { listPayments, type Customer } from "@/lib/sheet-logic";
import { Modal } from "./Modal";

type Paper = "58" | "80";
const PAPER_KEY = "receipt-paper";

function readPaper(): Paper {
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}

interface Props {
  customer: Customer;
  /** Which payment (default: the latest). */
  paymentIndex?: number;
  /** Shown above the preview, e.g. right after a payment was recorded. */
  notice?: string;
  onClose: () => void;
}

export function ReceiptDialog({ customer, paymentIndex, notice, onClose }: Props) {
  const payments = listPayments(customer.advance);
  const [index, setIndex] = useState(paymentIndex ?? payments.length - 1);
  const [paper, setPaper] = useState<Paper>("80");
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

  const receipt = buildReceipt(customer, index);

  return (
    <>
      <Modal
        title="وصل الأداء"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              سد
            </button>
            <button type="button" className="btn primary" onClick={() => window.print()} disabled={!receipt}>
              🖨️ طبع الوصل
            </button>
          </>
        }
      >
        {notice && <p className="alert info">{notice}</p>}
        {!receipt ? (
          <p className="empty">هاد الزبون ما عندو حتى دفعة.</p>
        ) : (
          <>
            <div className="receipt-options">
              {payments.length > 1 && (
                <label className="field">
                  <span>الدفعة</span>
                  <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                    {payments.map((p, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? "تسبيق" : `دفعة ${i + 1}`} · {money(p.amount)}
                        {p.stamp ? ` · ${p.stamp}` : ""}
                      </option>
                    ))}
                  </select>
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
            <div className="receipt-preview">
              <Ticket receipt={receipt} paper={paper} />
            </div>
          </>
        )}
      </Modal>
      {/* Printed copy: the only thing on the page when printing. */}
      {mounted && receipt && createPortal(<div id="print-root"><Ticket receipt={receipt} paper={paper} /></div>, document.body)}
    </>
  );
}

function Ticket({ receipt: r, paper }: { receipt: Receipt; paper: Paper }) {
  return (
    <article className={`ticket w${paper}`} dir="rtl" lang="ar">
      <header className="ticket-head">
        <p className="ticket-shop">{SHOP.name}</p>
        <p dir="ltr">{SHOP.phone}</p>
      </header>
      <hr />
      <div className="ticket-title">
        <strong>وصل الأداء</strong>
        <span dir="ltr">N° {r.number}</span>
      </div>
      {r.date && (
        <p className="ticket-line">
          <span>التاريخ</span>
          <span dir="ltr">{r.date}</span>
        </p>
      )}
      <hr />
      <p className="ticket-line">
        <span>الزبون</span>
        <span>{r.customer}</span>
      </p>
      {r.phone && (
        <p className="ticket-line">
          <span>الهاتف</span>
          <span dir="ltr">{r.phone}</span>
        </p>
      )}
      {r.items && (
        <p className="ticket-line">
          <span>السلعة</span>
          <span>{r.items}</span>
        </p>
      )}
      <hr />
      <div className="ticket-amount">
        <span>{r.label}</span>
        <strong>{money(r.amount)}</strong>
      </div>
      <hr />
      <p className="ticket-line">
        <span>الثمن الإجمالي</span>
        <span>{money(r.total)}</span>
      </p>
      <p className="ticket-line">
        <span>مجموع المدفوع</span>
        <span>{money(r.paidToDate)}</span>
      </p>
      <p className="ticket-line ticket-strong">
        <span>المتبقي</span>
        <span>{r.remaining > 0 ? money(r.remaining) : "خالص ✓"}</span>
      </p>
      {r.nextDueDate && (
        <p className="ticket-line">
          <span>الدفعة المقبلة</span>
          <span dir="ltr">{r.nextDueDate}</span>
        </p>
      )}
      {r.installment && (
        <p className="ticket-line">
          <span>الطريطة</span>
          <span>{r.installment}</span>
        </p>
      )}
      <hr />
      <p className="ticket-sign">توقيع البائع: ..................</p>
      <p className="ticket-thanks">{SHOP.thanks}</p>
    </article>
  );
}
