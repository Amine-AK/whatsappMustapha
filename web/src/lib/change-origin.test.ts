import { describe, expect, it } from "vitest";
import { cleanDevice, conflictDetails, deviceLabel, visibleFailures } from "./change-origin";
import { applyOp, EMPTY_LEDGER, type LedgerOp, type StockItem } from "./ledger";
import type { Me } from "./roles";

const T0 = "2026-11-14T06:00:00.000Z";
const item: StockItem = { id: "I-CABLE001", item: "Cable usb to type c", category: "إكسسوارات", condition: "جديد", buyPrice: 10, sellPrice: 30, quantity: 5, serial: "", codes: [], notes: "", createdAt: T0, updatedAt: T0 };
let n = 0;
const op = (body: object, extra: Partial<LedgerOp> = {}) => ({ ...body, opId: `O-ORIG${String(++n).padStart(4, "0")}`, at: `2026-11-14T07:${String(n).padStart(2, "0")}:00.000Z`, ...extra }) as LedgerOp;
const owner: Me = { id: "U-1", name: "المالك", role: "owner", services: [], seeCost: true };
const seller: Me = { id: "U-2", name: "Karim", role: "seller", services: ["sell_cash"], seeCost: false };

describe("where a change comes from", () => {
  it("labels the device from its browser", () => {
    const android = "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    expect(deviceLabel(android, "K3F9")).toBe("📱 Android · Chrome · #K3F9");
    expect(deviceLabel(android.replace("Chrome/130.0", "SamsungBrowser/26.0 Chrome/130.0"), "AB12", true)).toBe("📱 Android · Samsung · التطبيق · #AB12");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0", "PC01")).toBe("💻 Windows · Edge · #PC01");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "")).toBe("📱 iPhone · Safari");
    expect(cleanDevice("📱 Android\n· Chrome" + "x".repeat(100))).toHaveLength(60);
    expect(cleanDevice(42)).toBe("");
  });

  it("keeps who and where on the product, for every change to it", () => {
    let l = applyOp(EMPTY_LEDGER, op({ type: "stock.add", item }, { by: "المالك", device: "💻 Windows · Chrome · #PC01" })).ledger;
    expect(l.stock[0]).toMatchObject({ by: "المالك", device: "💻 Windows · Chrome · #PC01" });
    const base = l.stock[0].updatedAt;
    l = applyOp(l, op({ type: "stock.update", id: item.id, base, patch: { item: "Cable usb to type c v2" } }, { by: "Karim", device: "📱 Android · Chrome · #K3F9" })).ledger;
    expect(l.stock[0]).toMatchObject({ item: "Cable usb to type c v2", by: "Karim", device: "📱 Android · Chrome · #K3F9" });
  });

  it("explains a refused edit: who changed it first, from where, when, and what differs", () => {
    let l = applyOp(EMPTY_LEDGER, op({ type: "stock.add", item }, { by: "المالك", device: "PC" })).ledger;
    const oldBase = l.stock[0].updatedAt;
    l = applyOp(l, op({ type: "stock.update", id: item.id, base: oldBase, patch: { item: "Cable v2", sellPrice: 35 } }, { by: "Karim", device: "📱 Android · Chrome · #K3F9", at: "2026-11-14T06:42:00.000Z" })).ledger;
    const mine = op({ type: "stock.update", id: item.id, base: oldBase, patch: { item: "Cable v3", sellPrice: 35, buyPrice: 12 } });
    expect(applyOp(l, mine).result).toBe("conflict");
    const d = conflictDetails(mine, l, true)!;
    expect(d).toMatchObject({ who: "Karim", device: "📱 Android · Chrome · #K3F9", gone: false });
    // Shop time (UTC+1); machines without time zone data show UTC.
    expect(d.when).toMatch(/^14\/11\/2026 - 0[67]:42$/);
    // The same price on both sides is not listed.
    expect(d.changes).toEqual([
      { label: "السمية", mine: "Cable v3", now: "Cable v2" },
      { label: "ثمن الشراء", mine: "12 درهم", now: "10 درهم" },
    ]);
    // Someone who can't see costs doesn't see the buy price.
    expect(conflictDetails(mine, l, false)!.changes.map((c) => c.label)).toEqual(["السمية"]);
  });

  it("says when the product was deleted meanwhile", () => {
    expect(conflictDetails(op({ type: "stock.update", id: "I-GONE0001", base: T0, patch: { item: "x" } }), EMPTY_LEDGER, true)).toMatchObject({ gone: true });
  });

  it("shows a user only the refused changes their account may make", () => {
    const failed = [
      { op: op({ type: "stock.update", id: item.id, base: T0, patch: {} }) },
      { op: op({ type: "sale.add", lines: [{ type: "كاش" }], purchases: [] }) },
      { op: op({ type: "payment.update", id: "P-AAAA0001", base: T0, patch: {} }) },
    ];
    expect(visibleFailures(owner, failed)).toHaveLength(3);
    expect(visibleFailures(seller, failed).map((q) => q.op.type)).toEqual(["sale.add"]);
    expect(visibleFailures(null, failed)).toEqual([]);
  });
});
