import "server-only";
import { env } from "./env";
import { applyOp, emptyLedger, summarize, type Ledger, type LedgerOp, type OpResult } from "./ledger";
import { ARCHIVE_TABS, DEFAULT_CATEGORIES, HEADERS, ledgerToRows, migrateOldRows, rowsToLedger, sameRow, SHOP_KEYS, TABS, type TableKey } from "./ledger-sheet";
import { matchesClient } from "./format";
import { appendRows, deleteRows, ensureTabs, findTab, listTabs, readHeaders, readIds, readTables, updateRows, type Cell } from "./sheets";
import { todayISO } from "./sheet-logic";

const KEYS = Object.keys(TABS) as TableKey[];
const ARCHIVE_KEYS = Object.keys(ARCHIVE_TABS) as (keyof typeof ARCHIVE_TABS)[];

export async function needsSetup(): Promise<boolean> {
  return !(await findTab(TABS.clients, true));
}

/**
 * Sheets set up before the shop features (stock, sales, cash drawer) get
 * their tabs on first use, with the default product families.
 */
let headersChecked = false;

async function ensureShopTabs(): Promise<void> {
  const have = new Set((await listTabs()).map((t) => t.title));
  const missing = SHOP_KEYS.filter((k) => !have.has(TABS[k]));
  if (!headersChecked) {
    // Tabs made by an older version: add the column titles that came later
    // (e.g. «الأيقونة» in الفئات). Once per server start.
    const present = SHOP_KEYS.filter((k) => have.has(TABS[k]));
    const rows = await readHeaders(present.map((k) => TABS[k]));
    const fixes = present
      .filter((k) => HEADERS[k].some((h, i) => rows[TABS[k]][i] !== h))
      .map((k) => ({ title: TABS[k], row: 1, values: HEADERS[k] as Cell[] }));
    await updateRows(fixes);
    headersChecked = true;
  }
  if (!missing.length) return;
  await ensureTabs(missing.map((k) => ({ title: TABS[k], header: HEADERS[k] })));
  if (missing.includes("categories")) {
    const rows = ledgerToRows({ ...emptyLedger(), categories: DEFAULT_CATEGORIES }).categories;
    await appendRows(TABS.categories, [...rows.values()]);
  }
}

/** The whole active ledger, in one request. */
export async function loadLedger(): Promise<Ledger> {
  await ensureShopTabs();
  const tables = await readTables(KEYS.map((k) => TABS[k]));
  return rowsToLedger(Object.fromEntries(KEYS.map((k) => [k, tables[TABS[k]]])) as Record<TableKey, unknown[][]>);
}

/**
 * Write the difference between two versions of the ledger: changed rows are
 * overwritten, new rows appended, removed rows deleted. About 5 requests,
 * whatever the number of changes.
 */
export async function commit(before: Ledger, after: Ledger): Promise<void> {
  const today = todayISO();
  const old = ledgerToRows(before, today);
  const next = ledgerToRows(after, today);

  // Row numbers can move (another device deleted a row): read the ids right before writing.
  const needIds = KEYS.filter((k) => [...old[k].keys()].some((id) => !next[k].has(id) || !sameRow(old[k].get(id)!, next[k].get(id)!)));
  const ids = await readIds(needIds.map((k) => TABS[k]));

  const updates: { title: string; row: number; values: Cell[] }[] = [];
  const deletes: { title: string; rows: number[] }[] = [];
  for (const k of needIds) {
    const title = TABS[k];
    const rowOf = new Map<string, number>();
    ids[title].forEach((id, i) => id && !rowOf.has(id) && rowOf.set(id, i + 2));
    const rows: number[] = [];
    for (const [id, values] of old[k]) {
      const row = rowOf.get(id);
      if (!row) continue;
      const now = next[k].get(id);
      if (!now) rows.push(row);
      else if (!sameRow(values, now)) updates.push({ title, row, values: now });
    }
    if (rows.length) deletes.push({ title, rows });
  }
  await updateRows(updates);
  await deleteRows(deletes);
  for (const k of KEYS) {
    const added = [...next[k]].filter(([id]) => !old[k].has(id)).map(([, v]) => v);
    await appendRows(TABS[k], added);
  }
}

export interface SyncResult {
  opId: string;
  result: OpResult;
  message?: string;
}

/** Apply a batch of changes from a device, in order, and save them. */
export async function sync(ops: LedgerOp[]): Promise<SyncResult[]> {
  const before = await loadLedger();
  let ledger = before;
  const results: SyncResult[] = [];
  for (const op of ops) {
    const r = applyOp(ledger, op);
    ledger = r.ledger;
    results.push({ opId: op.opId, result: r.result, message: r.message });
  }
  if (results.some((r) => r.result === "ok")) await commit(before, ledger);
  return results;
}

// ---------------------------------------------------------------- setup

/** Create the tabs and move the customers of the old "Feuille 1" into them. */
export async function setup(): Promise<{ clients: number; purchases: number; payments: number }> {
  if (!(await needsSetup())) throw new Error("already set up");
  let migrated: Ledger = emptyLedger();
  const oldTab = await findTab(env.sheetName());
  if (oldTab) {
    const rows = (await readTables([oldTab.title], true))[oldTab.title];
    migrated = migrateOldRows(rows);
  }
  await ensureTabs([
    ...KEYS.map((k) => ({ title: TABS[k], header: HEADERS[k] })),
    ...ARCHIVE_KEYS.map((k) => ({ title: ARCHIVE_TABS[k], header: HEADERS[k] })),
  ]);
  const rows = ledgerToRows({ ...migrated, categories: DEFAULT_CATEGORIES });
  for (const k of KEYS) await appendRows(TABS[k], [...rows[k].values()]);
  return { clients: migrated.clients.length, purchases: migrated.purchases.length, payments: migrated.payments.length };
}

// ---------------------------------------------------------------- archive

type ArchiveKey = keyof typeof ARCHIVE_TABS;

/**
 * Move customers who finished paying more than 3 months ago (or the given
 * ones, if fully paid) to the archive tabs, with their purchases and payments.
 */
export async function archive(ids?: string[]): Promise<number> {
  const ledger = await loadLedger();
  const today = todayISO();
  const chosen = summarize(ledger, today)
    .filter((s) => (ids ? ids.includes(s.client.id) && s.remaining <= 0 : s.archivable))
    .map((s) => s.client.id);
  if (!chosen.length) return 0;
  const set = new Set(chosen);
  const moving: Ledger = {
    ...emptyLedger(),
    clients: ledger.clients.filter((c) => set.has(c.id)),
    purchases: ledger.purchases.filter((p) => set.has(p.clientId)),
    payments: ledger.payments.filter((p) => set.has(p.clientId)),
  };
  await ensureTabs(ARCHIVE_KEYS.map((k) => ({ title: ARCHIVE_TABS[k], header: HEADERS[k] })));
  // Copy first (skipping anything already copied by an interrupted run), then delete.
  const rows = ledgerToRows(moving, today);
  const already = await readIds(ARCHIVE_KEYS.map((k) => ARCHIVE_TABS[k]));
  for (const k of ARCHIVE_KEYS) {
    const have = new Set(already[ARCHIVE_TABS[k]]);
    await appendRows(ARCHIVE_TABS[k], [...rows[k]].filter(([id]) => !have.has(id)).map(([, v]) => v));
  }
  const remaining: Ledger = {
    ...ledger,
    clients: ledger.clients.filter((c) => !set.has(c.id)),
    purchases: ledger.purchases.filter((p) => !set.has(p.clientId)),
    payments: ledger.payments.filter((p) => !set.has(p.clientId)),
  };
  await commit(ledger, remaining);
  return chosen.length;
}

async function loadArchive(): Promise<{ ledger: Ledger; raw: Record<ArchiveKey, unknown[][]> }> {
  if (!(await findTab(ARCHIVE_TABS.clients))) {
    return { ledger: emptyLedger(), raw: { clients: [], purchases: [], payments: [] } };
  }
  const tables = await readTables(ARCHIVE_KEYS.map((k) => ARCHIVE_TABS[k]));
  const raw = Object.fromEntries(ARCHIVE_KEYS.map((k) => [k, tables[ARCHIVE_TABS[k]]])) as Record<ArchiveKey, unknown[][]>;
  return { ledger: rowsToLedger(raw), raw };
}

/** Archived customers whose name or phone matches (at most 50). */
export async function searchArchive(query: string): Promise<Ledger> {
  const { ledger } = await loadArchive();
  const found = ledger.clients.filter((c) => matchesClient(c.name, c.phone, query)).slice(0, 50);
  const ids = new Set(found.map((c) => c.id));
  return {
    ...emptyLedger(),
    clients: found,
    purchases: ledger.purchases.filter((p) => ids.has(p.clientId)),
    payments: ledger.payments.filter((p) => ids.has(p.clientId)),
  };
}

/** Bring an archived customer back to the active tabs (e.g. they buy again). */
export async function restore(clientId: string): Promise<boolean> {
  const { ledger } = await loadArchive();
  const client = ledger.clients.find((c) => c.id === clientId);
  if (!client) return false;
  const moving: Ledger = {
    ...emptyLedger(),
    clients: [client],
    purchases: ledger.purchases.filter((p) => p.clientId === clientId),
    payments: ledger.payments.filter((p) => p.clientId === clientId),
  };
  const active = await loadLedger();
  const rows = ledgerToRows(moving);
  for (const k of ARCHIVE_KEYS) {
    const have = new Set(active[k].map((x) => x.id));
    await appendRows(TABS[k], [...rows[k]].filter(([id]) => !have.has(id)).map(([, v]) => v));
  }
  // Then remove it from the archive.
  const ids = await readIds(ARCHIVE_KEYS.map((k) => ARCHIVE_TABS[k]));
  const moved = (k: ArchiveKey, id: string) => (k === "clients" ? id === clientId : moving[k].some((x) => x.id === id));
  await deleteRows(
    ARCHIVE_KEYS.map((k) => ({
      title: ARCHIVE_TABS[k],
      rows: ids[ARCHIVE_TABS[k]].flatMap((id, i) => (moved(k, id) ? [i + 2] : [])),
    })),
  );
  return true;
}
