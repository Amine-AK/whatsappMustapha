// Where a change comes from: the account that made it and the device it was
// made on. Kept on products («آخر تعديل من», «الجهاز» in المخزون), so when an
// edit is refused because the product changed meanwhile, the user sees who
// changed it, from which device, when, and what differs.
//
// - The device label is made on the device (system · browser · short id kept
//   in localStorage) and only cleaned by the server.
// - The account name is stamped by the server (/api/sync), never trusted from the device.

import { money } from "./format";
import type { Ledger, LedgerOp } from "./ledger";
import { opAllowed } from "./permissions";
import type { Me } from "./roles";
import { displayDateTime } from "./receipt";

const DEVICE_ID_KEY = "device-id";

/** «📱 Android · Chrome · #K3F9» from a browser's user agent and this device's id. */
export function deviceLabel(userAgent: string, id: string, installed = false): string {
  const ua = userAgent || "";
  const system = /Android/i.test(ua)
    ? "📱 Android"
    : /iPhone/i.test(ua)
      ? "📱 iPhone"
      : /iPad/i.test(ua)
        ? "📱 iPad"
        : /Windows/i.test(ua)
          ? "💻 Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "💻 Mac"
            : /Linux|CrOS/i.test(ua)
              ? "💻 Linux"
              : "🖥️ جهاز";
  const browser = /SamsungBrowser/i.test(ua)
    ? "Samsung"
    : /EdgA?\/|Edg\//i.test(ua)
      ? "Edge"
      : /OPR\/|Opera/i.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/i.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//i.test(ua)
            ? "Chrome"
            : /Safari/i.test(ua)
              ? "Safari"
              : "";
  return [system, browser, installed ? "التطبيق" : "", id ? `#${id}` : ""].filter(Boolean).join(" · ");
}

/** A device label sent by a device: one short line, nothing else. */
export function cleanDevice(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

/** This device's label (browser only). The id is made once and kept on the device. */
export function thisDevice(): string {
  if (typeof window === "undefined") return "";
  let id = "";
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) ?? "";
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      id = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
  } catch {}
  let installed = false;
  try {
    installed = window.matchMedia("(display-mode: standalone)").matches;
  } catch {}
  return deviceLabel(navigator.userAgent, id, installed);
}

export interface ConflictDetails {
  /** Account of the change that came first ("" when not known: older rows, other records). */
  who: string;
  device: string;
  /** "dd/mm/yyyy - HH:mm" of that change, "" when not known. */
  when: string;
  /** The fields this edit changes that are now different: what this edit wanted, what the sheet has. */
  changes: { label: string; mine: string; now: string }[];
  /** The record is gone (deleted meanwhile). */
  gone: boolean;
}

const LABELS: Record<string, string> = {
  item: "السمية",
  category: "الفئة",
  condition: "الحالة",
  buyPrice: "ثمن الشراء",
  sellPrice: "ثمن البيع",
  serial: "الكود",
  codes: "أكواد أخرى",
  notes: "ملاحظات",
  name: "الاسم",
  phone: "الهاتف",
  phones: "أرقام أخرى",
  installment: "الطريطة",
  period: "المدة",
  nextDueDate: "الدفعة المقبلة",
  date: "التاريخ",
  time: "الساعة",
  price: "الثمن",
  amount: "المبلغ",
  kind: "النوع",
  purchaseId: "السلعة",
  clientId: "الزبون",
};
const MONEY = new Set(["buyPrice", "sellPrice", "price", "amount", "installment"]);

function show(key: string, v: unknown): string {
  if (Array.isArray(v)) return v.join("، ") || "—";
  if (typeof v === "number") return MONEY.has(key) ? money(v) : String(v);
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

/** Edits that can be refused because the record changed meanwhile. */
const EDITS = new Set<LedgerOp["type"]>([
  "stock.update", "stock.delete", "stock.adjust",
  "client.update", "client.delete", "client.installment",
  "purchase.update", "purchase.delete", "payment.update", "payment.delete",
]);

/** The record an edit was for, in the ledger as it is now. */
function target(op: LedgerOp, ledger: Ledger): Record<string, unknown> | undefined {
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id) as Record<string, unknown> | undefined;
  switch (op.type) {
    case "stock.update":
    case "stock.delete":
      return find(ledger.stock, op.id);
    case "stock.adjust":
      return op.move ? find(ledger.stock, op.move.stockId) : undefined;
    case "client.update":
    case "client.delete":
    case "client.installment":
      return find(ledger.clients, op.id);
    case "purchase.update":
    case "purchase.delete":
      return find(ledger.purchases, op.id);
    case "payment.update":
    case "payment.delete":
      return find(ledger.payments, op.id);
    default:
      return undefined;
  }
}

/**
 * Why an edit was refused as «changed from another device»: who changed the
 * record first, from where, when, and which of this edit's fields now differ.
 * `seeCost`: the buy price is left out for users who can't see costs.
 */
export function conflictDetails(op: LedgerOp, ledger: Ledger, seeCost: boolean): ConflictDetails | null {
  if (!EDITS.has(op.type)) return null;
  const rec = target(op, ledger);
  if (!rec) return { who: "", device: "", when: "", changes: [], gone: true };
  const updatedAt = typeof rec.updatedAt === "string" ? rec.updatedAt : "";
  const when = updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? isoToShop(updatedAt) : "";
  const patch = "patch" in op && op.patch && typeof op.patch === "object" ? (op.patch as Record<string, unknown>) : {};
  const changes = Object.entries(patch)
    .filter(([k]) => k in LABELS && (seeCost || k !== "buyPrice"))
    .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(rec[k]))
    .map(([k, v]) => ({ label: LABELS[k], mine: show(k, v), now: show(k, rec[k]) }));
  if (op.type === "stock.adjust" && op.move) {
    changes.push({ label: "الكمية", mine: `${op.move.delta > 0 ? "+" : ""}${op.move.delta}`, now: show("quantity", rec.quantity) });
  }
  return { who: typeof rec.by === "string" ? rec.by : "", device: typeof rec.device === "string" ? rec.device : "", when, changes, gone: false };
}

/** ISO time → «14/11/2026 - 07:43» in shop time. */
function isoToShop(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return displayDateTime(`${get("year")}-${get("month")}-${get("day")}`, `${get("hour")}:${get("minute")}`);
}

/**
 * The refused changes this user may see: only for things their account is
 * allowed to do (the waiting list stays on the device when another account
 * logs in on it). Same rule as the server's.
 */
export function visibleFailures<T extends { op: LedgerOp }>(me: Me | null, failed: T[]): T[] {
  if (!me) return [];
  return failed.filter((q) => opAllowed(me, q.op));
}
