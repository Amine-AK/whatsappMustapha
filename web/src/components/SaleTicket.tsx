"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import type { Sale } from "@/lib/ledger";
import { displayDateTime, SHOP } from "@/lib/receipt";
import { round2 } from "@/lib/shop";
import { Modal } from "./Modal";

type Paper = "58" | "80";
const PAPER_KEY = "receipt-paper";

/** Receipt of a cash sale (وصل البيع), for the thermal printer. */
export function SaleTicketDialog({ lines, notice, onClose }: { lines: Sale[]; notice?: string; onClose: () => void }) {
  const [paper, setPaper] = useState<Paper>("80");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setPaper(localStorage.getItem(PAPER_KEY) === "58" ? "58" : "80");
    } catch {}
    setMounted(true);
  }, []);

  if (!lines.length) return null;
  return (
    <>
      <Modal
        title="وصل البيع"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              سد
            </button>
            <button type="button" className="btn primary" onClick={() => window.print()}>
              🖨️ طبع
            </button>
          </>
        }
      >
        {notice && <p className="alert info">{notice}</p>}
        <div className="field">
          <span>عرض الورق</span>
          <div className="segmented" role="group" aria-label="عرض الورق">
            {(["58", "80"] as Paper[]).map((p) => (
              <button
                key={p}
                type="button"
                dir="ltr"
                className={paper === p ? "on" : ""}
                aria-pressed={paper === p}
                onClick={() => {
                  setPaper(p);
                  try {
                    localStorage.setItem(PAPER_KEY, p);
                  } catch {}
                }}
              >
                {p} mm
              </button>
            ))}
          </div>
        </div>
        <div className="receipt-preview">
          <Ticket lines={lines} paper={paper} />
        </div>
      </Modal>
      {mounted && createPortal(<div id="print-root"><Ticket lines={lines} paper={paper} /></div>, document.body)}
    </>
  );
}

function Ticket({ lines, paper }: { lines: Sale[]; paper: Paper }) {
  const first = lines[0];
  const total = round2(lines.reduce((s, l) => s + l.sellPrice, 0));
  const list = round2(lines.reduce((s, l) => s + l.listPrice, 0));
  return (
    <article className={`ticket w${paper}`} dir="rtl" lang="ar">
      <header className="ticket-head">
        <p className="ticket-shop">{SHOP.name}</p>
        <p dir="ltr">{SHOP.phone}</p>
      </header>
      <hr />
      <div className="ticket-title">
        <strong>وصل البيع</strong>
        <span dir="ltr">N° {first.ticket}</span>
      </div>
      <p className="ticket-line">
        <span>التاريخ</span>
        <span dir="ltr">{displayDateTime(first.date, first.time)}</span>
      </p>
      {first.seller && (
        <p className="ticket-line">
          <span>البائع</span>
          <span>{first.seller}</span>
        </p>
      )}
      <hr />
      <table className="ticket-table">
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="t-date" dir="ltr">
                {l.quantity}×
              </td>
              <td>{l.item}</td>
              <td className="t-num">{money(l.sellPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      {list > total && (
        <p className="ticket-line">
          <span>التخفيض</span>
          <span>{money(round2(list - total))}</span>
        </p>
      )}
      <div className="ticket-amount">
        <span>المجموع ({first.type})</span>
        <strong>{money(total)}</strong>
      </div>
      <hr />
      <p className="ticket-thanks">{SHOP.thanks}</p>
    </article>
  );
}
