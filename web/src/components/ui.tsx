"use client";

import { useMemo, useState, type ReactNode } from "react";
import { matchesClient, money } from "@/lib/format";
import type { ClientSummary } from "@/lib/ledger";
import { Modal } from "./Modal";

export function Field({
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
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${wide ? " wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
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

/** Amount typed by the user: "1 500", "1500,5" → number, or NaN. */
export function parseAmount(v: string): number {
  const t = v.replace(/[\s  ]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function Confirm({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            رجوع
          </button>
          <button type="button" className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export interface Change {
  label: string;
  before: string;
  after: string;
}

/** List of "label: old ← new" lines shown before saving an edit. */
export function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <ul className="diff">
      {changes.map((c) => (
        <li key={c.label}>
          <span className="diff-label">{c.label}</span>
          <span className="diff-old">{c.before || "—"}</span>
          <span className="diff-arrow" aria-hidden="true">
            ←
          </span>
          <span className="diff-new">{c.after || "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export function diff(pairs: [string, string | number, string | number][]): Change[] {
  return pairs.filter(([, a, b]) => String(a).trim() !== String(b).trim()).map(([label, a, b]) => ({ label, before: String(a), after: String(b) }));
}

/** Choose a customer by name or phone (to move a payment recorded on the wrong one). */
export function ClientPicker({
  id,
  summaries,
  value,
  onChange,
}: {
  id: string;
  summaries: ClientSummary[];
  value: string;
  onChange: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = summaries.find((s) => s.client.id === value);
  const results = useMemo(
    () => (query.trim() ? summaries.filter((s) => matchesClient(s.client.name, s.client.phone, query)).slice(0, 8) : []),
    [summaries, query],
  );
  return (
    <div className="picker">
      <p className="picker-current">
        <strong>{chosen?.client.name ?? "—"}</strong>
        {chosen && <span className="muted"> · {money(chosen.remaining)}</span>}
      </p>
      <input id={id} type="search" placeholder="قلب على زبون آخر بالاسم ولا التيليفون…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <ul className="picker-list" role="listbox" aria-label="الزبناء">
          {results.map((s) => (
            <li key={s.client.id}>
              <button
                type="button"
                role="option"
                aria-selected={s.client.id === value}
                onClick={() => {
                  onChange(s.client.id);
                  setQuery("");
                }}
              >
                <span>{s.client.name}</span>
                <span className="muted" dir="ltr">
                  {s.client.phone}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
