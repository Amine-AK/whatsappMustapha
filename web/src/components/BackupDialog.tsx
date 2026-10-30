"use client";

import { useEffect, useState } from "react";
import { agoText, BACKUP_PHONE, canShareFile, downloadFile, fetchBackup, lastBackupAt, markBackupDone, sendBackup, snoozeBackup } from "@/lib/backup";
import { Modal } from "./Modal";

interface Props {
  /** Opened by the 24-hour reminder (shows "later") or from the menu. */
  reminder?: boolean;
  pending: number;
  onClose: () => void;
  onToast: (msg: string) => void;
}

/**
 * Sends the Excel backup to the shop's WhatsApp. The file is prepared as soon
 * as the window opens, so the share menu can open straight from the tap
 * (browsers only allow it right after one).
 */
export function BackupDialog({ reminder, pending, onClose, onToast }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"" | "chat">("");
  const last = lastBackupAt();

  useEffect(() => {
    let live = true;
    fetchBackup()
      .then((f) => live && setFile(f))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  async function send() {
    if (!file) return;
    const how = await sendBackup(file);
    if (!how) return;
    markBackupDone();
    if (how === "shared") {
      onToast("تصيفطات النسخة ✓");
      onClose();
    } else setSent("chat");
  }

  function later() {
    if (reminder) snoozeBackup();
    onClose();
  }

  const share = file ? canShareFile(file) : false;
  return (
    <Modal
      title="💾 النسخة الاحتياطية"
      onClose={later}
      footer={
        sent ? (
          <button type="button" className="btn primary" onClick={onClose}>
            سالينا
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={later}>
              {reminder ? "من بعد" : "سد"}
            </button>
            <button type="button" className="btn whatsapp" onClick={() => void send()} disabled={!file}>
              {file || error ? "📤 صيفط فواتساب" : "كنوجدو الملف…"}
            </button>
          </>
        )
      }
    >
      {reminder && <p className="lead">دازت 24 ساعة. صيفط النسخة الاحتياطية ديال اليوم لواتساب <span dir="ltr">{BACKUP_PHONE}</span>؟</p>}
      <p className="muted small">آخر نسخة من هاد الجهاز: {agoText(last)}</p>
      {pending > 0 && <p className="alert warn">كاين {pending} تعديل مازال ما تزامنش، ما غاديش يكونو فالملف حتى يتزامنو.</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <div className="file-chip">
          <span aria-hidden="true">📄</span>
          <span dir="ltr">{file.name}</span>
          <span className="muted small">{Math.max(1, Math.round(file.size / 1024))} KB</span>
        </div>
      )}
      {sent === "chat" ? (
        <p className="alert info">
          <span>
            تحمل الملف وتحلات المحادثة مع <bdi dir="ltr">{BACKUP_PHONE}</bdi>. زيد الملف بـ 📎 (ولا جرو للمحادثة) وصيفط.
          </span>
        </p>
      ) : (
        <ol className="steps small-steps">
          {share ? (
            <>
              <li>ضغط «📤 صيفط فواتساب».</li>
              <li>اختار <strong>WhatsApp</strong> من القائمة.</li>
              <li>
                اختار المحادثة ديال <span dir="ltr">{BACKUP_PHONE}</span> وصيفط.
              </li>
            </>
          ) : (
            <>
              <li>ضغط «📤 صيفط فواتساب»: الملف غادي يتحمل وتحل المحادثة مع <span dir="ltr">{BACKUP_PHONE}</span>.</li>
              <li>زيد الملف بـ 📎 (ولا جرو للمحادثة) وصيفط.</li>
            </>
          )}
        </ol>
      )}
      {file && !sent && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            downloadFile(file);
            markBackupDone();
            onToast("تحمل الملف ✓");
          }}
        >
          ⬇️ غير حمّل الملف
        </button>
      )}
    </Modal>
  );
}
