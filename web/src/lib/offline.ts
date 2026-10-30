// Offline changes: each add / edit / payment / delete is saved on the device as
// an operation, shown right away, and sent to the sheet in order when online.

import {
  appendPayment,
  COL,
  dueStatus,
  rowToCustomer,
  WRITE_WIDTH,
  type Customer,
  type CustomerInput,
} from "./sheet-logic";

/** A customer as the device knows it. `uid` stays the same while row numbers move. */
export interface LocalCustomer extends Customer {
  uid: string;
  /** Has changes not yet saved in the sheet. */
  pending?: boolean;
}

/** Last list received from the sheet. */
export interface Snapshot {
  customers: LocalCustomer[];
  fetchedAt: string; // ISO time
}

interface OpBase {
  id: string;
  uid: string;
  /** Customer name, to show in the list of unsent changes. */
  label: string;
  createdAt: string;
  status: "pending" | "failed";
  /** Times it was sent. >0 means the sheet may already have it. */
  attempts: number;
  error?: string;
  /** Where the customer was when the change failed, to retry it later. */
  target?: { row: number; expected: string[] };
}

export type Op =
  | (OpBase & { kind: "add"; input: CustomerInput; stamp: string })
  | (OpBase & { kind: "edit"; input: CustomerInput; stamp: string })
  | (OpBase & { kind: "pay"; amount: number; paidDate: string; nextDueDate: string; stamp: string })
  | (OpBase & { kind: "delete" });

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Build a customer from form values, the way the sheet will show it. */
export function customerFromInput(input: CustomerInput, row: number, today: string): Customer {
  const cells: string[] = new Array(WRITE_WIDTH).fill("");
  cells[COL.name] = input.name;
  cells[COL.phone] = input.phone;
  cells[COL.items] = input.items;
  cells[COL.sell] = input.sell;
  cells[COL.buy] = input.buy;
  cells[COL.advance] = input.advance;
  cells[COL.period] = input.period;
  cells[COL.dueDate] = input.dueDate;
  cells[COL.installment] = input.installment;
  return rowToCustomer(cells, row, today)!;
}

function withInput(c: LocalCustomer, input: CustomerInput, today: string): LocalCustomer {
  // Keep row and expected: they describe the sheet, which hasn't changed yet.
  return { ...customerFromInput(input, c.row, today), uid: c.uid, row: c.row, expected: c.expected, pending: true };
}

export function inputOf(c: CustomerInput): CustomerInput {
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

/** The list as it will be once every pending change reaches the sheet. */
export function applyOps(customers: LocalCustomer[], ops: Op[], today: string): LocalCustomer[] {
  let list = customers.map((c) => ({ ...c, status: dueStatus(c.dueDate, c.remaining, today) }));
  for (const op of ops) {
    if (op.status !== "pending") continue;
    const i = list.findIndex((c) => c.uid === op.uid);
    switch (op.kind) {
      case "add":
        if (i === -1) list = [...list, { ...customerFromInput(op.input, 0, today), uid: op.uid, pending: true }];
        break;
      case "edit":
        if (i !== -1) list[i] = withInput(list[i], op.input, today);
        break;
      case "pay":
        if (i !== -1) {
          const input = inputOf(list[i]);
          input.advance = appendPayment(input.advance, op.amount, op.stamp);
          input.dueDate = op.nextDueDate;
          list[i] = withInput(list[i], input, today);
        }
        break;
      case "delete":
        if (i !== -1) list = list.filter((_, j) => j !== i);
        break;
    }
  }
  return list;
}

/** Give customers from a fresh sheet read stable ids, reusing the old id when the row is unchanged. */
export function keyCustomers(fresh: Customer[], previous: LocalCustomer[]): LocalCustomer[] {
  const byRow = new Map(previous.map((c) => [c.row, c]));
  return fresh.map((c) => {
    const old = byRow.get(c.row);
    const same = old && old.expected.join("\u0001") === c.expected.join("\u0001");
    return { ...c, uid: same ? old.uid : newId() };
  });
}

/** After a row is deleted in the sheet, the rows below move up by one. */
export function shiftRowsAfterDelete(customers: LocalCustomer[], deletedRow: number): LocalCustomer[] {
  return customers.map((c) => (c.row > deletedRow ? { ...c, row: c.row - 1 } : c));
}

export function opDescription(op: Op): string {
  switch (op.kind) {
    case "add":
      return "زبون جديد";
    case "edit":
      return "تعديل";
    case "pay":
      return `دفعة ${op.amount} درهم`;
    case "delete":
      return "حذف";
  }
}
