import "server-only";
import { JWT } from "google-auth-library";
import { env } from "./env";

// Google Sheets REST API v4, called with a service account. Requests are
// batched: Google allows about 60 per minute.

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
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

type Query = Record<string, string | string[]>;

async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const url = new URL(`${env.sheetsApiBase()}/v4/spreadsheets/${encodeURIComponent(env.sheetId())}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    // Quota or a Google hiccup: wait and retry a few times.
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

export interface SheetInfo {
  sheetId: number;
  title: string;
}

let tabsCache: { at: number; tabs: SheetInfo[] } | null = null;

export async function listTabs(refresh = false): Promise<SheetInfo[]> {
  if (!refresh && tabsCache && Date.now() - tabsCache.at < 60_000) return tabsCache.tabs;
  const data = await api<{ sheets: { properties: SheetInfo }[] }>("", { query: { fields: "sheets.properties(sheetId,title)" } });
  tabsCache = { at: Date.now(), tabs: data.sheets.map((s) => s.properties) };
  return tabsCache.tabs;
}

export async function findTab(title: string, refresh = false): Promise<SheetInfo | undefined> {
  return (await listTabs(refresh)).find((t) => t.title === title);
}

export function a1(title: string, cells: string): string {
  return `'${title.replace(/'/g, "''")}'!${cells}`;
}

/** Create the tabs that don't exist yet, right-to-left, with a bold frozen header row. */
export async function ensureTabs(specs: { title: string; header: string[] }[]): Promise<void> {
  const existing = new Set((await listTabs(true)).map((t) => t.title));
  const missing = specs.filter((s) => !existing.has(s.title));
  if (!missing.length) return;
  await api(":batchUpdate", {
    method: "POST",
    body: {
      requests: missing.map((s) => ({
        addSheet: { properties: { title: s.title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } },
      })),
    },
  });
  await api("/values:batchUpdate", {
    method: "POST",
    body: { valueInputOption: "RAW", data: missing.map((s) => ({ range: a1(s.title, "A1"), values: [s.header] })) },
  });
  await listTabs(true);
}

// ---------------------------------------------------------------- read

/** Rows from row 2 of several tabs, in one request. Numbers come back as numbers. */
export async function readTables(titles: string[], formatted = false): Promise<Record<string, unknown[][]>> {
  const out: Record<string, unknown[][]> = Object.fromEntries(titles.map((t) => [t, []]));
  if (!titles.length) return out;
  const data = await api<{ valueRanges?: { range: string; values?: unknown[][] }[] }>("/values:batchGet", {
    query: {
      ranges: titles.map((t) => a1(t, "A2:Z")),
      valueRenderOption: formatted ? "FORMATTED_VALUE" : "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    },
  });
  (data.valueRanges ?? []).forEach((vr, i) => {
    out[titles[i]] = vr.values ?? [];
  });
  return out;
}

/** Every row of every tab, header included, in one request (for the Excel backup). */
export async function readAllTabs(): Promise<{ title: string; rows: unknown[][] }[]> {
  const tabs = await listTabs(true);
  if (!tabs.length) return [];
  const data = await api<{ valueRanges?: { values?: unknown[][] }[] }>("/values:batchGet", {
    query: {
      ranges: tabs.map((t) => a1(t.title, "A1:ZZ")),
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    },
  });
  return tabs.map((t, i) => ({ title: t.title, rows: data.valueRanges?.[i]?.values ?? [] }));
}

/** Column A (ids) from row 2 of several tabs: index i is sheet row i + 2. */
export async function readIds(titles: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = Object.fromEntries(titles.map((t) => [t, []]));
  if (!titles.length) return out;
  const data = await api<{ valueRanges?: { values?: unknown[][] }[] }>("/values:batchGet", {
    query: { ranges: titles.map((t) => a1(t, "A2:A")) },
  });
  (data.valueRanges ?? []).forEach((vr, i) => {
    out[titles[i]] = (vr.values ?? []).map((r) => String(r[0] ?? "").trim());
  });
  return out;
}

// ---------------------------------------------------------------- write

export type Cell = string | number;

/** Overwrite whole rows, in one request. Values are stored as typed (no formulas, no date guessing). */
export async function updateRows(updates: { title: string; row: number; values: Cell[] }[]): Promise<void> {
  if (!updates.length) return;
  await api("/values:batchUpdate", {
    method: "POST",
    body: { valueInputOption: "RAW", data: updates.map((u) => ({ range: a1(u.title, `A${u.row}`), values: [u.values] })) },
  });
}

/** Delete rows (sheet row numbers) from several tabs, in one request. */
export async function deleteRows(deletes: { title: string; rows: number[] }[]): Promise<void> {
  const all = await listTabs();
  const requests = deletes.flatMap((d) => {
    const tab = all.find((t) => t.title === d.title);
    if (!tab) return [];
    // Bottom first, so the row numbers above stay right.
    return [...new Set(d.rows)]
      .sort((a, b) => b - a)
      .map((row) => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }));
  });
  if (requests.length) await api(":batchUpdate", { method: "POST", body: { requests } });
}

/** Add rows at the end of a tab. */
export async function appendRows(title: string, rows: Cell[][]): Promise<void> {
  if (!rows.length) return;
  await api(`/values/${encodeURIComponent(a1(title, "A1"))}:append`, {
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: { values: rows },
  });
}

// ---------------------------------------------------------------- reminder log

export const REMINDER_LOG_SHEET_NAME = "سجل التذكيرات";
const REMINDER_LOG_HEADER = ["تاريخ الإرسال", "رقم الزبون", "اسم الزبون", "الهاتف", "تاريخ الأداء", "المتبقي", "النتيجة", "التفاصيل"];

export interface ReminderLogEntry {
  sentAt: string;
  clientId: string;
  name: string;
  phone: string;
  dueDate: string;
  remaining: string;
  result: "sent" | "failed";
  detail: string;
}

export async function readReminderLog(): Promise<ReminderLogEntry[]> {
  if (!(await findTab(REMINDER_LOG_SHEET_NAME))) return [];
  const rows = (await readTables([REMINDER_LOG_SHEET_NAME], true))[REMINDER_LOG_SHEET_NAME];
  return rows.map((r) => ({
    sentAt: String(r[0] ?? ""),
    clientId: String(r[1] ?? ""),
    name: String(r[2] ?? ""),
    phone: String(r[3] ?? ""),
    dueDate: String(r[4] ?? ""),
    remaining: String(r[5] ?? ""),
    result: r[6] === "sent" ? "sent" : "failed",
    detail: String(r[7] ?? ""),
  }));
}

export async function appendReminderLog(entries: ReminderLogEntry[]): Promise<void> {
  if (!entries.length) return;
  await ensureTabs([{ title: REMINDER_LOG_SHEET_NAME, header: REMINDER_LOG_HEADER }]);
  await appendRows(
    REMINDER_LOG_SHEET_NAME,
    entries.map((e) => [e.sentAt, e.clientId, e.name, e.phone, e.dueDate, e.remaining, e.result, e.detail]),
  );
}
