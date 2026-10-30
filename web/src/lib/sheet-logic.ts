// Shared rules: amounts, dates, phone numbers, instalment periods.

/** Columns of the old "Feuille 1" (one row per customer), read once by the migration. 0-based. */
export const COL = {
  name: 0, // A  اسم الزبون
  phone: 1, // B  الهاتف
  items: 2, // C  السلع (+ time stamps)
  sell: 3, // D  ثمن البيع
  advance: 6, // G  التسبيق / الدفعات (+ time stamps)
  period: 8, // I  سيمانة / 15 يوم / شهر / تحديد يدوي
  dueDate: 9, // J  تاريخ الدفعة المقبلة
  installment: 13, // N  مبلغ الطريطة
} as const;

export const PERIODS = ["سيمانة", "15 يوم", "شهر", "تحديد يدوي"] as const;
const MANUAL_PERIODS = ["تحديد يدوي", "تحديث يدوي"];

export const TIMEZONE = "Africa/Casablanca";

export type DueStatus = "overdue" | "today" | "tomorrow" | "upcoming" | "nodate" | "paid";

const DATE_STAMP = /\(\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[^)]*\)/g;

export function extractNumbers(value: unknown): number[] {
  const text = String(value ?? "")
    .replace(/[  ]/g, "")
    .replace(DATE_STAMP, "")
    .replace(/,/g, ".");
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Sum every number in the text, ignoring "(dd/MM/yyyy - HH:mm)" stamps. */
export function parseSum(value: unknown): number {
  return extractNumbers(value).reduce((a, b) => a + b, 0);
}

export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** International form without '+', e.g. 212661234567. */
export function formatMoroccoPhone(phone: string): string {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("212")) return d;
  if (d.startsWith("0")) return "212" + d.slice(1);
  if (d.length === 9) return "212" + d;
  return d;
}

export function isValidPhone(intl: string): boolean {
  return /^\d{11,15}$/.test(intl);
}

export function stripStamps(text: string): string {
  return String(text ?? "")
    .replace(DATE_STAMP, "")
    .replace(/\s+\+\s+/g, " + ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------- dates

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function partsInZone(date: Date, timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

export function todayISO(now = new Date()): string {
  const p = partsInZone(now);
  return `${p.y}-${p.m}-${p.d}`;
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return dt.toISOString().slice(0, 10);
}

/** Read a date cell: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy or a Sheets serial number. */
export function parseSheetDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  let m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  let iso = "";
  if (m) iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  else if ((m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  else if (/^\d{5}$/.test(text)) iso = addDays("1899-12-30", Number(text));
  return isISODate(iso) ? iso : "";
}

/** Next payment date one period after `fromISO`. */
export function nextDateForPeriod(period: string, fromISO: string): string {
  const p = String(period ?? "");
  if (p.includes("سيمانة") || p.includes("أسبوع") || p.includes("7")) return addDays(fromISO, 7);
  if (p.includes("15")) return addDays(fromISO, 15);
  if (p.includes("شهر") || p.includes("30")) return addMonths(fromISO, 1);
  return "";
}

export function isManualPeriod(period: string): boolean {
  return MANUAL_PERIODS.includes(String(period ?? "").trim());
}

/** "dd/MM/yyyy - HH:mm" in shop time. Uses the current time of day. */
export function makeStamp(dateISO?: string, now = new Date()): string {
  const p = partsInZone(now);
  const [y, m, d] = (dateISO && isISODate(dateISO) ? dateISO : `${p.y}-${p.m}-${p.d}`).split("-");
  return `${d}/${m}/${y} - ${p.hh}:${p.mm}`;
}

export function dueStatus(dueDate: string, remaining: number, today: string): DueStatus {
  if (remaining <= 0) return "paid";
  if (!dueDate) return "nodate";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate === addDays(today, 1)) return "tomorrow";
  return "upcoming";
}

export function installmentLine(raw: string, period: string): string {
  const p = String(period ?? "").trim();
  const suffix = p && !isManualPeriod(p) ? ` (كل ${p})` : "";
  const amount = parseSum(raw);
  if (amount > 0) return `${formatAmount(amount)} درهم${suffix}`;
  const text = String(raw ?? "").trim();
  return (text && text !== "0" ? text : "حسب الاتفاق") + suffix;
}
