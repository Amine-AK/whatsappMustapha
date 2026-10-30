// Port of the rules in code.gs. Works on the displayed values of the main
// customer sheet: 17 columns, row 1 is the header. Indexes are 0-based.

export const COL = {
  name: 0, // A  اسم الزبون
  phone: 1, // B  الهاتف
  items: 2, // C  السلع (+ time stamps)
  sell: 3, // D  ثمن البيع
  buy: 4, // E  ثمن الشراء
  profit: 5, // F  الربح (calculated)
  advance: 6, // G  التسبيق / الدفعات (+ time stamps)
  remaining: 7, // H  المتبقي (calculated)
  period: 8, // I  سيمانة / 15 يوم / شهر / تحديد يدوي
  dueDate: 9, // J  تاريخ الدفعة المقبلة
  installment: 13, // N  مبلغ الطريطة
} as const;

// Columns A..N are the ones the app writes (O..Q hold the script's links).
export const WRITE_WIDTH = 14;
// User-entered columns compared to detect that someone else changed a row.
export const CHECKED_COLUMNS = [0, 1, 2, 3, 4, 6, 8, 9, 13];

export const PERIODS = ["سيمانة", "15 يوم", "شهر", "تحديد يدوي"] as const;
const MANUAL_PERIODS = ["تحديد يدوي", "تحديث يدوي"];

export const TIMEZONE = "Africa/Casablanca";

export type DueStatus = "overdue" | "today" | "tomorrow" | "upcoming" | "nodate" | "paid";

export interface CustomerInput {
  name: string;
  phone: string;
  items: string;
  sell: string;
  buy: string;
  advance: string;
  period: string;
  dueDate: string; // yyyy-mm-dd or ""
  installment: string;
}

export interface Customer extends CustomerInput {
  row: number;
  phoneIntl: string;
  itemsPlain: string;
  sellTotal: number;
  buyTotal: number;
  paidTotal: number;
  profit: number;
  remaining: number;
  status: DueStatus;
  /** Displayed values of columns A..N when read, sent back to detect edits by others. */
  expected: string[];
}

const DATE_STAMP = /\(\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[^)]*\)/g;
const HAS_DATE_STAMP = /\(\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;

export function extractNumbers(value: unknown): number[] {
  const text = String(value ?? "")
    .replace(/[  ]/g, "")
    .replace(DATE_STAMP, "")
    .replace(/,/g, ".");
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Sum every number in the cell, ignoring the "(dd/MM/yyyy - HH:mm)" stamps (parseSumValue_). */
export function parseSum(value: unknown): number {
  return extractNumbers(value).reduce((a, b) => a + b, 0);
}

export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** International form without '+', e.g. 212661234567 (formatMoroccoPhone_). */
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

/** Read the due date cell: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy or a Sheets serial number. */
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

/** calculateNextDateFromPeriod_, from a given date instead of always from today. */
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

/** "dd/MM/yyyy - HH:mm" like the stamps code.gs adds. Uses the current time of day. */
export function makeStamp(dateISO?: string, now = new Date()): string {
  const p = partsInZone(now);
  const [y, m, d] = (dateISO && isISODate(dateISO) ? dateISO : `${p.y}-${p.m}-${p.d}`).split("-");
  return `${d}/${m}/${y} - ${p.hh}:${p.mm}`;
}

/** Add a stamp to each "+"-separated part that has none (onEditInstalled for columns C and G). */
export function addMissingStamps(expr: string, stamp: string): string {
  return String(expr ?? "")
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (HAS_DATE_STAMP.test(p) ? p : `${p} (${stamp})`))
    .join(" + ");
}

export function appendPayment(advance: string, amount: number, stamp: string): string {
  const part = `${formatAmount(amount)} (${stamp})`;
  const current = String(advance ?? "").trim();
  return current && current !== "0" ? `${current} + ${part}` : part;
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

// ---------------------------------------------------------------- rows

function cell(row: unknown[], i: number): string {
  return i < row.length && row[i] != null ? String(row[i]).trim() : "";
}

export function rowToCustomer(row: unknown[], rowNumber: number, today: string): Customer | null {
  const input: CustomerInput = {
    name: cell(row, COL.name),
    phone: cell(row, COL.phone),
    items: cell(row, COL.items),
    sell: cell(row, COL.sell),
    buy: cell(row, COL.buy),
    advance: cell(row, COL.advance),
    period: cell(row, COL.period),
    dueDate: parseSheetDate(cell(row, COL.dueDate)),
    installment: cell(row, COL.installment),
  };
  // Same skip rule as processRowCalculations_: nothing to show without a name or items.
  if (!input.name && !input.items) return null;
  const sellTotal = parseSum(input.sell);
  const buyTotal = parseSum(input.buy);
  const paidTotal = parseSum(input.advance);
  const remaining = sellTotal - paidTotal;
  return {
    ...input,
    row: rowNumber,
    phoneIntl: formatMoroccoPhone(input.phone),
    itemsPlain: stripStamps(input.items),
    sellTotal,
    buyTotal,
    paidTotal,
    profit: sellTotal - buyTotal,
    remaining,
    status: dueStatus(input.dueDate, remaining, today),
    expected: Array.from({ length: WRITE_WIDTH }, (_, i) => cell(row, i)),
  };
}

export function rowsToCustomers(rows: unknown[][], today: string): Customer[] {
  const out: Customer[] = [];
  rows.forEach((row, i) => {
    const c = rowToCustomer(row, i + 2, today);
    if (c) out.push(c);
  });
  return out;
}

/** True when someone changed the row since `expected` was read (or rows moved). */
export function rowChanged(current: unknown[], expected: string[]): boolean {
  return CHECKED_COLUMNS.some((i) => !sameCell(i, cell(current, i), String(expected[i] ?? "")));
}

const AMOUNT_COLUMNS: number[] = [COL.sell, COL.buy, COL.installment];

/**
 * Compare two values of one column by meaning, not by how Sheets displays them
 * ("2026-11-04" = "04/11/2026", "1500.5" = "1500,5", "3000+500" = "3500").
 */
export function sameCell(col: number, a: string, b: string): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (x === y) return true;
  if (col === COL.dueDate) return parseSheetDate(x) === parseSheetDate(y);
  if (AMOUNT_COLUMNS.includes(col)) {
    // Text that isn't an amount (e.g. "حسب الاتفاق") must match exactly.
    if (!extractNumbers(x).length || !extractNumbers(y).length) return false;
    return Math.abs(parseSum(x) - parseSum(y)) < 0.005;
  }
  return x.replace(/\s+/g, " ") === y.replace(/\s+/g, " ");
}

const INPUT_COLUMNS: [keyof CustomerInput, number][] = [
  ["name", COL.name],
  ["phone", COL.phone],
  ["items", COL.items],
  ["sell", COL.sell],
  ["buy", COL.buy],
  ["advance", COL.advance],
  ["period", COL.period],
  ["dueDate", COL.dueDate],
  ["installment", COL.installment],
];

/** True when the row already holds exactly these values (used to make retries safe). */
export function rowMatchesInput(row: unknown[], input: CustomerInput): boolean {
  return INPUT_COLUMNS.every(([key, col]) => sameCell(col, cell(row, col), input[key]));
}

/** Rows (1-based sheet numbers, header = 1) whose content matches `expected`. */
export function findRowsMatching(rows: unknown[][], expected: string[]): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (!rowChanged(r, expected)) out.push(i + 2);
  });
  return out;
}

export function isStamp(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/.test(s);
}

/** Stamp the "+"-separated parts of items and payments now, like the server would. */
export function stampInput(input: CustomerInput, stamp: string): CustomerInput {
  return { ...input, items: addMissingStamps(input.items, stamp), advance: addMissingStamps(input.advance, stamp) };
}

// ---------------------------------------------------------------- writing

export interface ValidationError {
  field: keyof CustomerInput;
  message: string;
}

export function normalizeInput(raw: Partial<Record<keyof CustomerInput, unknown>>): CustomerInput {
  const s = (v: unknown) => String(v ?? "").trim();
  return {
    name: s(raw.name),
    phone: s(raw.phone),
    items: s(raw.items),
    sell: s(raw.sell),
    buy: s(raw.buy),
    advance: s(raw.advance),
    period: s(raw.period),
    dueDate: s(raw.dueDate),
    installment: s(raw.installment),
  };
}

export function validateInput(input: CustomerInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!input.name) errors.push({ field: "name", message: "الاسم ضروري" });
  if (input.name.length > 200) errors.push({ field: "name", message: "الاسم طويل بزاف" });
  if (input.phone && !isValidPhone(formatMoroccoPhone(input.phone)))
    errors.push({ field: "phone", message: "رقم الهاتف غير صحيح" });
  if (!input.items) errors.push({ field: "items", message: "السلعة ضرورية" });
  if (parseSum(input.sell) <= 0) errors.push({ field: "sell", message: "ثمن البيع ضروري" });
  if (input.dueDate && !isISODate(input.dueDate))
    errors.push({ field: "dueDate", message: "التاريخ غير صحيح" });
  for (const key of Object.keys(input) as (keyof CustomerInput)[]) {
    if (input[key].length > 2000) errors.push({ field: key, message: "النص طويل بزاف" });
  }
  return errors;
}

/** Text cells are written with a leading apostrophe so Sheets keeps them as typed
 *  (keeps the 0 of "0661…" and never runs "=…" or "+…" as a formula). */
function asText(v: string): string {
  return v ? `'${v}` : "";
}

function asNumberOrText(v: string): string | number {
  const t = v.replace(/[  \s]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : asText(v);
}

/**
 * Values for columns A..N (USER_ENTERED). Stamps are added like code.gs does,
 * profit (F) and remaining (H) are calculated, and K..M keep `current` values.
 */
export function inputToRow(input: CustomerInput, stamp: string, current: unknown[] = []): (string | number)[] {
  const items = addMissingStamps(input.items, stamp);
  const advance = addMissingStamps(input.advance, stamp);
  const sellTotal = parseSum(input.sell);
  const profit = sellTotal - parseSum(input.buy);
  const remaining = sellTotal - parseSum(advance);
  const row: (string | number)[] = new Array(WRITE_WIDTH).fill("");
  row[COL.name] = asText(input.name);
  row[COL.phone] = asText(input.phone);
  row[COL.items] = asText(items);
  row[COL.sell] = asNumberOrText(input.sell);
  row[COL.buy] = asNumberOrText(input.buy);
  row[COL.profit] = asText(`${formatAmount(profit)} درهم`);
  row[COL.advance] = asText(advance);
  row[COL.remaining] = asText(`${formatAmount(remaining)} درهم`);
  row[COL.period] = asText(input.period);
  row[COL.dueDate] = input.dueDate; // USER_ENTERED turns yyyy-mm-dd into a real date
  for (let i = 10; i <= 12; i++) row[i] = cell(current, i) ? asText(cell(current, i)) : "";
  row[COL.installment] = asNumberOrText(input.installment);
  return row;
}

export function customerToInput(c: CustomerInput): CustomerInput {
  return {
    name: c.name,
    phone: c.phone,
    items: c.items,
    sell: c.sell,
    buy: c.buy,
    advance: c.advance,
    period: c.period,
    dueDate: c.dueDate,
    installment: c.installment,
  };
}

/** Default next due date after a payment: one period after the current due date. */
export function suggestNextDueDate(c: Pick<Customer, "period" | "dueDate">, paidDate: string): string {
  if (isManualPeriod(c.period) || !c.period) return c.dueDate;
  return nextDateForPeriod(c.period, c.dueDate || paidDate) || c.dueDate;
}
