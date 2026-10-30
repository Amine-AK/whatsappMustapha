import "server-only";
import { readCustomerRows, readRow } from "./sheets";
import { findRowsMatching, rowChanged } from "./sheet-logic";

/**
 * Find the customer the app last saw at `row` with these values.
 *
 * Changes made offline are sent later, when rows may have moved (another
 * customer deleted above). If the row number no longer holds the same
 * customer, look for the one row whose content matches.
 */
export async function locateRow(row: number, expected: string[]): Promise<{ row: number; current: string[] } | null> {
  const current = await readRow(row);
  if (!rowChanged(current, expected)) return { row, current };
  const all = await readCustomerRows();
  const matches = findRowsMatching(all, expected);
  if (matches.length !== 1) return null;
  return { row: matches[0], current: all[matches[0] - 2] };
}

/** Sheet row numbers whose content satisfies `test`. */
export async function findRows(test: (row: string[]) => boolean): Promise<{ row: number; current: string[] }[]> {
  const all = await readCustomerRows();
  const out: { row: number; current: string[] }[] = [];
  all.forEach((r, i) => {
    if (test(r)) out.push({ row: i + 2, current: r });
  });
  return out;
}
