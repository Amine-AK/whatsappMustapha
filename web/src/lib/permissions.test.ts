import { describe, expect, it } from "vitest";
import { emptyLedger, type LedgerOp, type Sale, type StockItem } from "./ledger";
import { ledgerFor, opAllowed, stampOp } from "./permissions";
import { can, type Me } from "./roles";

const owner: Me = { id: "owner", name: "المالك", role: "owner", services: [], seeCost: true };
const seller: Me = { id: "U-1", name: "سعيد", role: "seller", services: ["sell_cash", "payment"], seeCost: false };
const stockman: Me = { id: "U-2", name: "كريم", role: "stock", services: [], seeCost: false };
const op = (body: object) => ({ opId: "O-TEST0001", at: "2026-11-01T10:00:00.000Z", ...body }) as LedgerOp;
const item: StockItem = { id: "I-TV000001", item: "TV", category: "x", condition: "جديد", buyPrice: 2000, sellPrice: 2600, quantity: 3, serial: "", codes: [], notes: "", createdAt: "", updatedAt: "" };
const sale = (type: "كاش" | "كريدي", over: Partial<Sale> = {}): Sale => ({
  id: "V-TEST0001", ticket: "V-TEST0001", date: "2026-11-01", time: "10:00", item: "TV", category: "x", stockId: item.id, quantity: 2,
  buyPrice: null, listPrice: 5200, sellPrice: 5000, type, clientId: "", purchaseId: "", seller: "anyone", notes: "", createdAt: "", updatedAt: "", ...over,
});

describe("roles", () => {
  it("owner can do everything; a seller only what was given; the stock manager only adds stock", () => {
    expect(can(owner, "owner_only")).toBe(true);
    expect([can(seller, "sell_cash"), can(seller, "sell_credit"), can(seller, "owner_only"), can(seller, "stock_add")]).toEqual([true, false, false, false]);
    expect([can(stockman, "stock_add"), can(stockman, "stock"), can(stockman, "sell_cash")]).toEqual([true, false, false]);
    expect(can({ role: "seller", services: ["stock"] }, "stock_add")).toBe(true);
  });

  it("checks every change sent from a phone", () => {
    expect(opAllowed(seller, op({ type: "sale.add", lines: [sale("كاش")], purchases: [] }))).toBe(true);
    expect(opAllowed(seller, op({ type: "sale.add", lines: [sale("كريدي")], purchases: [] }))).toBe(false);
    expect(opAllowed(seller, op({ type: "payment.add", payment: {} }))).toBe(true);
    expect(opAllowed(seller, op({ type: "client.delete", id: "C-X" }))).toBe(false);
    expect(opAllowed(seller, op({ type: "sale.delete", id: "V-X" }))).toBe(false);
    expect(opAllowed(stockman, op({ type: "stock.add", item }))).toBe(true);
    expect(opAllowed(stockman, op({ type: "stock.adjust", move: { delta: 5 } }))).toBe(true);
    expect(opAllowed(stockman, op({ type: "stock.adjust", move: { delta: -1 } }))).toBe(false);
    expect(opAllowed(stockman, op({ type: "stock.update", id: item.id, base: "", patch: {} }))).toBe(false);
    expect(opAllowed(stockman, op({ type: "payment.add", payment: {} }))).toBe(false);
  });

  it("the server writes who did it, and fills the cost a seller can't see", () => {
    const l = { ...emptyLedger(), stock: [item] };
    const stamped = stampOp(seller, op({ type: "sale.add", lines: [sale("كاش")], purchases: [] }), l) as Extract<LedgerOp, { type: "sale.add" }>;
    expect(stamped.lines[0].seller).toBe("سعيد");
    expect(stamped.lines[0].buyPrice).toBe(4000);
    // A seller without costs can't overwrite the cost of a product.
    const patch = stampOp(seller, op({ type: "stock.update", id: item.id, base: "", patch: { buyPrice: 0, sellPrice: 2700 } }), l) as Extract<LedgerOp, { type: "stock.update" }>;
    expect(patch.patch).toEqual({ sellPrice: 2700 });
  });

  it("each user only receives what they may see", () => {
    const l = { ...emptyLedger(), stock: [item], sales: [sale("كاش", { buyPrice: 4000 })], clients: [{ id: "C-1" }] as never };
    expect(ledgerFor(owner, l).stock[0].buyPrice).toBe(2000);
    const s = ledgerFor(seller, l);
    expect([s.stock[0].buyPrice, s.sales[0].buyPrice, s.clients.length]).toEqual([0, null, 1]);
    const k = ledgerFor(stockman, l);
    expect([k.clients.length, k.sales.length, k.stock.length]).toEqual([0, 0, 1]);
  });
});
