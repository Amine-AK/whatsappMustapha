"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client";

/** First run on the new layout: create the tabs and move the customers of "Feuille 1". */
export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ clients: number; purchases: number; payments: number } | null>(null);

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await apiFetch("/api/setup", { method: "POST", body: { confirm: true } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card setup-card">
        <span className="brand-mark big" aria-hidden="true">
          ⚡
        </span>
        <h1>تنظيم جديد للـ Google Sheet</h1>
        {!result ? (
          <>
            <p>
              التطبيق ولا كيخدم بأوراق منفصلة: <strong>الزبناء</strong>، <strong>المشتريات</strong>، <strong>الدفعات</strong> و<strong>تغييرات الطريطة</strong>، مع
              أوراق الأرشيف.
            </p>
            <p className="muted">
              غادي نزيدو هاد الأوراق وننقلو ليهم الزبناء لي كاينين فـ «Feuille 1» (كل سلعة وكل دفعة بالتاريخ ديالها). «Feuille 1» كتبقى كيف ما هي كنسخة
              احتياطية.
            </p>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn primary block" onClick={run} disabled={busy}>
              {busy ? "كننقلو…" : "زيد الأوراق ونقل الزبناء"}
            </button>
          </>
        ) : (
          <>
            <p className="alert info">
              ✓ تزادو الأوراق. تنقلو {result.clients} زبون، {result.purchases} سلعة و {result.payments} دفعة.
            </p>
            <button type="button" className="btn primary block" onClick={onDone}>
              دخل للتطبيق
            </button>
          </>
        )}
      </div>
    </main>
  );
}
