import "server-only";
import { JWT } from "google-auth-library";
import { env } from "./env";

// Google Sheets REST API v4, called with a service account.

export const BACKUP_SHEET_NAME = "_Backup_Security_"; // kept in sync for code.gs
export const REMINDER_LOG_SHEET_NAME = "سجل التذكيرات";
const REMINDER_LOG_HEADER = ["تاريخ الإرسال", "السطر", "اسم الزبون", "الهاتف", "تاريخ الأداء", "المتبقي", "النتيجة", "التفاصيل"];

export class SheetsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let jwt: JWT | null = null;

async function accessToken(): Promise<string> {
  const fixed = env.staticAccessToken();
  if (fixed) return fixed;
  jwt ??= new JWT({
    email: env.serviceAccountEmail(),
    key: env.privateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new SheetsError("Could not get a Google access token", 500);
  return token;
}

async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${env.sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(env.sheetId())}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    // Quota (60 requests/minute) or a Google hiccup: wait and retry a few times.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error?.message ?? text;
    } catch {}
    throw new SheetsError(`Google Sheets ${res.status}: ${message}`, res.status);
  }
}

// ---------------------------------------------------------------- tabs

interface SheetInfo {
  sheetId: number;
  title: string;
}

let tabsCache: { at: number; tabs: SheetInfo[] } | null = null;

async function tabs(refresh = false): Promise<SheetInfo[]> {
  if (!refresh && tabsCache && Date.now() - tabsCache.at < 5 * 60_000) return tabsCache.tabs;
  const data = await api<{ sheets: { properties: SheetInfo }[] }>("", {
    query: { fields: "sheets.properties(sheetId,title)" },
  });
  tabsCache = { at: Date.now(), tabs: data.sheets.map((s) => s.properties) };
  return tabsCache.tabs;
}

/** The customer tab: GOOGLE_SHEET_NAME, else the first tab (getMainCustomerSheet_). */
async function mainTab(): Promise<SheetInfo> {
  const all = await tabs();
  const tab = all.find((t) => t.title === env.sheetName()) ?? all[0];
  if (!tab) throw new SheetsError("The spreadsheet has no tabs", 500);
  return tab;
}

async function findTab(title: string): Promise<SheetInfo | undefined> {
  return (await tabs()).find((t) => t.title === title);
}

function range(title: string, a1: string): string {
  return `'${title.replace(/'/g, "''")}'!${a1}`;
}

// ---------------------------------------------------------------- customers

/** Displayed values of every customer row (row 2 onwards), columns A..Q. */
export async function readCustomerRows(): Promise<string[][]> {
  const tab = await mainTab();
  const data = await api<{ values?: string[][] }>(`/values/${encodeURIComponent(range(tab.title, "A2:Q"))}`, {
    query: { valueRenderOption: "FORMATTED_VALUE" },
  });
  return data.values ?? [];
}

export async function readRow(row: number): Promise<string[]> {
  const tab = await mainTab();
  const data = await api<{ values?: string[][] }>(`/values/${encodeURIComponent(range(tab.title, `A${row}:Q${row}`))}`, {
    query: { valueRenderOption: "FORMATTED_VALUE" },
  });
  return data.values?.[0] ?? [];
}

/** Append a customer row; returns its row number. */
export async function appendCustomerRow(values: (string | number)[]): Promise<number> {
  const tab = await mainTab();
  const data = await api<{ updates: { updatedRange: string } }>(
    `/values/${encodeURIComponent(range(tab.title, "A:N"))}:append`,
    {
      method: "POST",
      query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
      body: { values: [values] },
    },
  );
  const match = data.updates.updatedRange.match(/![A-Z]+(\d+)/);
  if (!match) throw new SheetsError(`Unexpected range ${data.updates.updatedRange}`, 500);
  const row = Number(match[1]);
  await syncBackupRow(row);
  return row;
}

export async function updateCustomerRow(row: number, values: (string | number)[]): Promise<void> {
  const tab = await mainTab();
  await api(`/values/${encodeURIComponent(range(tab.title, `A${row}:N${row}`))}`, {
    method: "PUT",
    query: { valueInputOption: "USER_ENTERED" },
    body: { values: [values] },
  });
  await syncBackupRow(row);
}

export async function deleteCustomerRow(row: number): Promise<void> {
  const tab = await mainTab();
  const backup = await findTab(BACKUP_SHEET_NAME);
  const deleteRow = (sheetId: number) => ({
    deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } },
  });
  // Delete the same row in the backup tab too, so code.gs keeps comparing the right rows.
  const requests = [deleteRow(tab.sheetId)];
  if (backup) {
    const backupRows = await api<{ values?: string[][] }>(`/values/${encodeURIComponent(range(backup.title, "A:Q"))}`);
    if ((backupRows.values?.length ?? 0) >= row) requests.push(deleteRow(backup.sheetId));
  }
  await api(":batchUpdate", { method: "POST", body: { requests } });
}

/**
 * code.gs keeps a hidden copy of every row and compares edits against it.
 * Edits through the API don't run its triggers, so copy the row ourselves.
 */
async function syncBackupRow(row: number): Promise<void> {
  const backup = await findTab(BACKUP_SHEET_NAME);
  if (!backup) return;
  const values = await readRow(row);
  const padded = Array.from({ length: 17 }, (_, i) => values[i] ?? "");
  await api(`/values/${encodeURIComponent(range(backup.title, `A${row}:Q${row}`))}`, {
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [padded] },
  });
}

// ---------------------------------------------------------------- reminder log

export interface ReminderLogEntry {
  sentAt: string;
  row: number;
  name: string;
  phone: string;
  dueDate: string;
  remaining: string;
  result: "sent" | "failed";
  detail: string;
}

async function ensureLogTab(): Promise<SheetInfo> {
  const existing = await findTab(REMINDER_LOG_SHEET_NAME);
  if (existing) return existing;
  await api(":batchUpdate", {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title: REMINDER_LOG_SHEET_NAME } } }] },
  });
  const tab = (await tabs(true)).find((t) => t.title === REMINDER_LOG_SHEET_NAME);
  if (!tab) throw new SheetsError("Could not create the reminder log tab", 500);
  await api(`/values/${encodeURIComponent(range(tab.title, "A1:H1"))}`, {
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [REMINDER_LOG_HEADER] },
  });
  return tab;
}

export async function readReminderLog(): Promise<ReminderLogEntry[]> {
  const tab = await findTab(REMINDER_LOG_SHEET_NAME);
  if (!tab) return [];
  const data = await api<{ values?: string[][] }>(`/values/${encodeURIComponent(range(tab.title, "A2:H"))}`, {
    query: { valueRenderOption: "FORMATTED_VALUE" },
  });
  return (data.values ?? []).map((r) => ({
    sentAt: r[0] ?? "",
    row: Number(r[1] ?? 0),
    name: r[2] ?? "",
    phone: r[3] ?? "",
    dueDate: r[4] ?? "",
    remaining: r[5] ?? "",
    result: r[6] === "sent" ? "sent" : "failed",
    detail: r[7] ?? "",
  }));
}

export async function appendReminderLog(entries: ReminderLogEntry[]): Promise<void> {
  if (!entries.length) return;
  const tab = await ensureLogTab();
  await api(`/values/${encodeURIComponent(range(tab.title, "A:H"))}:append`, {
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: {
      values: entries.map((e) => [e.sentAt, String(e.row), e.name, e.phone, e.dueDate, e.remaining, e.result, e.detail]),
    },
  });
}
