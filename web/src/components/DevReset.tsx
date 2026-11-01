"use client";
// DEV ONLY: «مسح جميع المعلومات». Remove before going live (see src/lib/dev-reset.ts).

import { useState } from "react";
import { downloadFile, fetchBackup } from "@/lib/backup";
import { apiFetch } from "@/lib/client";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";

export function DevResetDialog({ data, onClose, onToast }: { data: LedgerState; onClose: () => void; onToast: (msg: string) => void }) {
  const [typed, setTyped] = useState("");
  const [backup, setBackup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = typed.trim() === "مسح" && data.online && !busy;

  async function reset() {
    setBusy(true);
    setError("");
    try {
      if (backup) downloadFile(await fetchBackup());
      await apiFetch("/api/dev/reset", { method: "POST", body: { confirm: "مسح" } });
      await data.clearDevice();
      onToast("تمسحو جميع المعلومات");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="🧪 مسح جميع المعلومات"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            رجوع
          </button>
          <button type="button" className="btn danger" onClick={() => void reset()} disabled={!ready}>
            {busy ? "كنمسحو…" : "🗑️ مسح كلشي"}
          </button>
        </>
      }
    >
      <p className="alert warn">
        <span>زر ديال التطوير والتجربة فقط. غادي يتحيد قبل ما يبدا الخدمة الحقيقية.</span>
      </p>
      <div className="alert error">
        <span>
          غادي يتمسحو من الـ Google Sheet <strong>جميع</strong>: الزبناء، المشتريات، الدفعات، المخزون، المبيعات، الصندوق، الأرشيف وسجل التذكيرات. العناوين كيبقاو والفئات الأصلية كترجع. ما
          يمكنش ترجعو.
        </span>
      </div>
      <p className="muted small">التعديلات اللي ما تزامنوش فهاد الجهاز كيتمسحو حتى هما. ورقة «Feuille 1» ما كتقاسش.</p>
      <label className="check">
        <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
        حمّل نسخة Excel قبل المسح
      </label>
      <div className="field">
        <label htmlFor="dev-confirm">كتب «مسح» باش تأكد</label>
        <input id="dev-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </div>
      {!data.online && <p className="alert warn">خاصو الأنترنيت.</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
