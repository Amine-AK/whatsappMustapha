"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { dueText, money } from "@/lib/format";
import type { Customer } from "@/lib/sheet-logic";
import { Modal } from "./Modal";

interface Item {
  customer: Customer;
  blocker: string | null;
  sentToday: boolean;
}

type Outcome = { status: "sent" | "failed" | "skipped"; detail: string };

const BATCH = 10;

export function RemindersDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ today: string; watiConfigured: boolean; overdue: Item[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"pick" | "confirm" | "sending" | "done">("pick");
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    apiFetch<{ today: string; watiConfigured: boolean; overdue: Item[] }>("/api/reminders")
      .then((d) => {
        setData(d);
        setSelected(new Set(d.overdue.filter((i) => !i.blocker && !i.sentToday).map((i) => i.customer.row)));
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const sendable = useMemo(() => data?.overdue.filter((i) => !i.blocker) ?? [], [data]);
  const chosen = sendable.filter((i) => selected.has(i.customer.row));
  const counts = Object.values(outcomes).reduce(
    (acc, o) => ({ ...acc, [o.status]: acc[o.status] + 1 }),
    { sent: 0, failed: 0, skipped: 0 },
  );

  function toggle(row: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  async function send() {
    setStep("sending");
    setSendError("");
    const queue = chosen.map((i) => ({ row: i.customer.row, expected: i.customer.expected }));
    for (let i = 0; i < queue.length; i += BATCH) {
      try {
        const { results } = await apiFetch<{ results: ({ row: number } & Outcome)[] }>("/api/reminders/send", {
          method: "POST",
          body: { targets: queue.slice(i, i + BATCH) },
        });
        setOutcomes((o) => ({ ...o, ...Object.fromEntries(results.map((r) => [r.row, { status: r.status, detail: r.detail }])) }));
      } catch (e) {
        setSendError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setStep("done");
  }

  const busy = step === "sending";
  let footer: React.ReactNode = null;
  if (step === "pick" && data) {
    footer = (
      <>
        <button type="button" className="btn" onClick={onClose}>
          سد
        </button>
        <button type="button" className="btn primary" disabled={!chosen.length || !data.watiConfigured} onClick={() => setStep("confirm")}>
          صيفط التذكير ({chosen.length})
        </button>
      </>
    );
  } else if (step === "confirm") {
    footer = (
      <>
        <button type="button" className="btn" onClick={() => setStep("pick")}>
          رجوع
        </button>
        <button type="button" className="btn primary" onClick={send}>
          أكد وصيفط
        </button>
      </>
    );
  } else if (step === "done") {
    footer = (
      <button type="button" className="btn primary" onClick={onClose}>
        سالينا
      </button>
    );
  }

  return (
    <Modal title="تذكير الزبناء المتأخرين" onClose={onClose} busy={busy} footer={footer}>
      {loadError && (
        <p className="alert error" role="alert">
          {loadError}
        </p>
      )}
      {!data && !loadError && <p className="muted">كنجيبو اللائحة…</p>}

      {data && !data.watiConfigured && (
        <p className="alert warn" role="alert">
          WATI ماشي مضبوط فالسيرفر. زيد WATI_API_ENDPOINT و WATI_ACCESS_TOKEN و WATI_TEMPLATE_NAME (شوف README).
        </p>
      )}

      {data && data.overdue.length === 0 && <p className="empty">ما كاين حتى زبون متأخر. 👌</p>}

      {step === "confirm" && (
        <p className="alert info">
          غادي تصيفط رسالة واتساب لـ <strong>{chosen.length}</strong> زبون عبر WATI. الرسالة ما يمكنش ترجع.
        </p>
      )}

      {(step === "sending" || step === "done") && (
        <div className="progress" role="status" aria-live="polite">
          <progress max={chosen.length} value={counts.sent + counts.failed + counts.skipped} />
          <span>
            تصيفطو {counts.sent} · فشلو {counts.failed} · تخطيناهم {counts.skipped}
          </span>
        </div>
      )}
      {sendError && (
        <p className="alert error" role="alert">
          {sendError}
        </p>
      )}

      {data && data.overdue.length > 0 && (
        <ul className="pick-list">
          {data.overdue.map(({ customer: c, blocker, sentToday }) => {
            const outcome = outcomes[c.row];
            return (
              <li key={c.row} className={blocker ? "disabled" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(c.row) && !blocker}
                    disabled={Boolean(blocker) || step !== "pick"}
                    onChange={() => toggle(c.row)}
                  />
                  <span className="pick-main">
                    <strong>{c.name}</strong>
                    <span className="muted" dir="ltr">
                      {c.phone || "—"}
                    </span>
                  </span>
                  <span className="pick-side">
                    <span className="amount">{money(c.remaining)}</span>
                    <span className="muted">{dueText(c.dueDate, c.status, data.today)}</span>
                  </span>
                </label>
                {(blocker || sentToday || outcome) && (
                  <p className={`pick-note ${outcome?.status ?? (blocker ? "failed" : "skipped")}`}>
                    {outcome
                      ? outcome.status === "sent"
                        ? "✓ تصيفط"
                        : outcome.detail
                      : blocker ?? "تصيفط ليه تذكير اليوم"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
