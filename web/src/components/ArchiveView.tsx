"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { money } from "@/lib/format";
import { summarize, type ClientSummary, type Ledger } from "@/lib/ledger";
import { displayDate } from "@/lib/receipt";
import { ReceiptDialog } from "./ReceiptDialog";
import type { LedgerState } from "./useLedger";

/** Archived customers live only in the sheet: search them there (needs internet). */
export function ArchiveView({ data, query, onToast }: { data: LedgerState; query: string; onToast: (t: string) => void }) {
  const [result, setResult] = useState<Ledger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statementOf, setStatementOf] = useState<ClientSummary | null>(null);
  const [restoring, setRestoring] = useState("");

  useEffect(() => {
    if (!data.online) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<{ ledger: Ledger }>(`/api/archive?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          setResult(r.ledger);
          setError("");
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query, data.online]);

  const list = useMemo(() => (result ? summarize(result, data.today).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)) : []), [result, data.today]);

  async function restore(s: ClientSummary) {
    setRestoring(s.client.id);
    try {
      await apiFetch("/api/archive/restore", { method: "POST", body: { id: s.client.id } });
      await data.refresh();
      setResult((r) => (r ? { ...r, clients: r.clients.filter((c) => c.id !== s.client.id) } : r));
      onToast(`رجع ${s.client.name} للائحة`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring("");
    }
  }

  if (!data.online) return <p className="alert warn">الأرشيف كاين غير فالـ Google Sheet، خاصو الأنترنيت.</p>;

  return (
    <section aria-label="الأرشيف" className="archive-view">
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <p className="result-count muted" aria-live="polite">
        {loading ? "كنقلبو فالأرشيف…" : `${list.length} زبون فالأرشيف${list.length === 50 ? " (أول 50، دقق البحث)" : ""}`}
      </p>
      {!loading && list.length === 0 && !error && <p className="empty">ما لقينا حتى زبون فالأرشيف.</p>}
      <ul className="cards">
        {list.map((s) => (
          <li key={s.client.id} className="card status-paid">
            <div className="card-top">
              <div className="card-who">
                <h3>{s.client.name}</h3>
                {s.client.phone && (
                  <span className="phone" dir="ltr">
                    {s.client.phone}
                  </span>
                )}
              </div>
              <span className="pill">مؤرشف</span>
            </div>
            <p className="items">
              {s.purchases.map((p) => p.item).join("، ") || "—"}
            </p>
            <p className="muted small">
              شرا بـ {money(s.total)} · خلص {money(s.paid)} · آخر حركة {s.lastActivity ? displayDate(s.lastActivity) : "—"}
            </p>
            <div className="card-actions two">
              <button type="button" className="btn" onClick={() => setStatementOf(s)}>
                كشف الحساب
              </button>
              <button type="button" className="btn primary" onClick={() => void restore(s)} disabled={Boolean(restoring) || data.pendingCount > 0}>
                {restoring === s.client.id ? "…" : "رجعو للائحة"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {statementOf && <ReceiptDialog summary={statementOf} mode="statement" onClose={() => setStatementOf(null)} />}
    </section>
  );
}
