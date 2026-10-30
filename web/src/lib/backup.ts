// Excel backup on the device: download it, send it on WhatsApp, and remember
// when it was last done so the app can ask again every 24 hours.

import { whatsappLink } from "./receipt";

/** WhatsApp number that receives the daily backup. */
export const BACKUP_PHONE = "0662275062";
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;
/** "Later" asks again after this long. */
export const SNOOZE_MS = 3 * 60 * 60 * 1000;

const LAST_KEY = "backup-last";
const SNOOZE_KEY = "backup-snooze";

function readTime(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeTime(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

/** When the last backup was downloaded or sent from this device (0 = never). */
export function lastBackupAt(): number {
  return readTime(LAST_KEY);
}

export function markBackupDone(now = Date.now()) {
  writeTime(LAST_KEY, now);
  writeTime(SNOOZE_KEY, 0);
}

export function snoozeBackup(now = Date.now()) {
  writeTime(SNOOZE_KEY, now + SNOOZE_MS);
}

/** True when 24 hours have passed since the last backup and "later" isn't running. */
export function backupDue(now = Date.now(), last = lastBackupAt(), snoozedUntil = readTime(SNOOZE_KEY)): boolean {
  return now - last >= BACKUP_EVERY_MS && now >= snoozedUntil;
}

/** "قبل 3 ساعات" / "قبل 2 أيام" / "عمرها ما تدارت" */
export function agoText(time: number, now = Date.now()): string {
  if (!time) return "عمرها ما تدارت";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "دابا" : `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${Math.round(hours / 24)} يوم`;
}

/** Fetch the Excel file of the whole Google Sheet. */
export async function fetchBackup(): Promise<File> {
  let res: Response;
  try {
    res = await fetch("/api/export", { cache: "no-store" });
  } catch {
    throw new Error("ما كاينش الأنترنيت. تأكد من الاتصال وعاود.");
  }
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("سجل الدخول من جديد");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `خطأ ${res.status}`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "backup.xlsx";
  return new File([await res.blob()], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function backupMessage(file: File): string {
  return `💾 النسخة الاحتياطية ديال ELECTRO-LMESTOUR\n📄 ${file.name}`;
}

/** Can this device hand the file straight to WhatsApp (share menu with the file attached)? */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Send the file to WhatsApp. WhatsApp links can't carry a file, so:
 * - phones: the share menu opens with the file (choose WhatsApp, then the contact);
 * - PCs: the file is downloaded and the chat with BACKUP_PHONE opens; drop the file in it.
 * Returns false when the user closed the share menu.
 */
export async function sendBackup(file: File): Promise<"shared" | "chat" | false> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text: backupMessage(file) });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      // Some browsers refuse files here: fall through to download + chat.
    }
  }
  downloadFile(file);
  const link = whatsappLink(BACKUP_PHONE, `${backupMessage(file)}\n(زيد الملف 📎)`, /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? "app" : "web");
  if (link) window.open(link, "_blank", "noopener,noreferrer");
  return "chat";
}
