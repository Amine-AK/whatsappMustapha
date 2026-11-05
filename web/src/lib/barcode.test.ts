import { describe, expect, it } from "vitest";
import { ean13Check, ean13Modules, freshShopCode, isEan13, isShopCode, newShopCode, shopCodeOf, withShopCode } from "./barcode";

describe("shop barcodes", () => {
  it("computes EAN-13 check digits", () => {
    expect(ean13Check("400638133393")).toBe(1);
    expect(isEan13("4006381333931")).toBe(true);
    expect(isEan13("4006381333932")).toBe(false);
  });

  it("makes stable, valid in-store codes", () => {
    const a = newShopCode("I-ABC123", new Set());
    expect(a).toMatch(/^2\d{12}$/);
    expect(isShopCode(a)).toBe(true);
    expect(newShopCode("I-ABC123", new Set())).toBe(a);
    expect(newShopCode("I-OTHER", new Set())).not.toBe(a);
    const b = newShopCode("I-ABC123", new Set([a]));
    expect(b).not.toBe(a);
    expect(isShopCode(b)).toBe(true);
  });

  it("finds the shop code among a product's codes", () => {
    const code = newShopCode("I-X", new Set());
    expect(shopCodeOf({ serial: "SN-1", codes: ["6111234567890", code] })).toBe(code);
    expect(shopCodeOf({ serial: "4006381333931", codes: [] })).toBeUndefined();
  });

  it("draws 95 modules with the guard bars", () => {
    const m = ean13Modules("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.endsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    // Known start of 4006381333931 (parity LGLLGG): 0 in L, 0 in G.
    expect(m.slice(3, 17)).toBe("0001101" + "0100111");
  });

  it("makes a new random shop code on demand, never one already taken", () => {
    const a = freshShopCode(new Set());
    expect(isShopCode(a)).toBe(true);
    let n = 0;
    const steps = [0.1, 0.2, 0.1, 0.2, 0.3, 0.4];
    const taken = new Set([freshShopCode(new Set(), () => steps[n++ % 2])]);
    n = 0;
    const b = freshShopCode(taken, () => steps[n++]);
    expect(taken.has(b)).toBe(false);
    expect(isShopCode(b)).toBe(true);
  });

  it("swaps only the shop code of a product", () => {
    const old = newShopCode("I-1", new Set());
    const fresh = newShopCode("I-2", new Set());
    expect(withShopCode(["SN123", old, "QR9"], fresh)).toEqual(["SN123", fresh, "QR9"]);
    expect(withShopCode(["SN123"], fresh)).toEqual(["SN123", fresh]);
    expect(withShopCode([], fresh)).toEqual([fresh]);
  });
});
