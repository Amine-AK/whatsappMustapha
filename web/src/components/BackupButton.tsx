"use client";

import { useState } from "react";

/** Downloads the whole Google Sheet as an Excel file (every tab, archive included). */
export function BackupButton({ online, pending, onToast }: { online: boolean; pending: number; onToast: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/export", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `خطأ ${res.status}`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "backup.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onToast("تحمل الملف ✓");
    } catch (e) {
      onToast(e instanceof TypeError ? "ما كاينش الأنترنيت. تأكد من الاتصال وعاود." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup" aria-label="نسخة احتياطية">
      <div>
        <strong>💾 نسخة احتياطية</strong>
        <p className="muted small">ملف Excel فيه جميع الأوراق ديال الـ Google Sheet: الزبناء، المشتريات، الدفعات، الأرشيف…</p>
        {pending > 0 && <p className="small warn-text">كاين {pending} تعديل مازال ما تزامنش، ما غاديش يكونو فالملف حتى يتزامنو.</p>}
      </div>
      <button type="button" className="btn" onClick={() => void download()} disabled={!online || busy}>
        {busy ? "كنوجدو الملف…" : "⬇️ تحميل Excel"}
      </button>
    </section>
  );
}
