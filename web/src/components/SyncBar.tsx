"use client";

import { useState } from "react";
import type { LedgerState } from "./useLedger";

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-MA", {
    timeZone: "Africa/Casablanca",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Connection and sync state: offline, sending, waiting changes, refused changes. */
export function SyncBar({ state }: { state: LedgerState }) {
  const [open, setOpen] = useState(false);
  const { online, syncing, pendingCount, failed, lastSync, syncError } = state;

  let tone = "ok";
  let text = `متزامن مع الـ Google Sheet${lastSync ? ` · ${timeOf(lastSync)}` : ""}`;
  if (!online) {
    tone = "offline";
    text = `بلا أنترنيت · كتشوف النسخة ديال ${timeOf(lastSync) || "آخر مرة"}`;
  } else if (syncing) {
    tone = "busy";
    text = pendingCount ? `كنصيفطو ${pendingCount} تعديل للـ Google Sheet…` : "كنجيبو آخر المعلومات…";
  } else if (pendingCount) {
    tone = "wait";
    text = `${pendingCount} تعديل باقي ما وصلش للـ Google Sheet`;
  }

  return (
    <section className={`syncbar ${tone}`} aria-live="polite" aria-label="المزامنة">
      <div className="syncbar-row">
        <span className="sync-dot" aria-hidden="true" />
        <p className="syncbar-text">
          {text}
          {!online && pendingCount > 0 && <strong> · {pendingCount} تعديل محفوظ فالتيليفون</strong>}
        </p>
        {online && !syncing && pendingCount > 0 && (
          <button type="button" className="btn small-btn" onClick={() => void state.refresh()}>
            زامن دابا
          </button>
        )}
      </div>
      {online && !syncing && pendingCount > 0 && syncError && <p className="syncbar-note">آخر محاولة: {syncError}</p>}
      {!online && (
        <p className="syncbar-note">تقدر تزيد، تعدل، تسجل دفعات وتحذف. كلشي كيتسجل فالتيليفون ويتصيفط بوحدو ملي ترجع الأنترنيت.</p>
      )}

      {failed.length > 0 && (
        <div className="sync-failed">
          <button type="button" className="sync-failed-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            ⚠️ {failed.length} تعديل ما قدرش يتسجل فالـ Google Sheet {open ? "▲" : "▼"}
          </button>
          {open && (
            <ul>
              {failed.map((q) => (
                <li key={q.op.opId}>
                  <div>
                    <strong>{q.label}</strong>
                    <p className="small">{q.error}</p>
                  </div>
                  <div className="sync-failed-actions">
                    <button
                      type="button"
                      className="btn small-btn"
                      onClick={() => state.retry(q.op.opId)}
                      disabled={!online}
                      title="عاود صيفطو (التعديل غادي يتطبق على آخر نسخة فالورقة)"
                    >
                      طبقو
                    </button>
                    <button type="button" className="btn small-btn danger-ghost" onClick={() => state.discard(q.op.opId)}>
                      تجاهل
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
