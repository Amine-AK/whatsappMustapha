import { describe, expect, it } from "vitest";
import { ean13Check, ean13Modules, isEan13, isShopCode, newShopCode, shopCodeOf } from "./barcode";

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
});
