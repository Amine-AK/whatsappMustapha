import { describe, expect, it } from "vitest";
import { isLandscape, lookOf, moveBy, resetMoves, resizeBy, sameLook, withLook, barcodeFit, contentBox, contentSize, DEFAULT_SETUP, pageCss, pageGroups, paperWidth, pitch, sanitizeSetup } from "./label-layout";

describe("sticker layout", () => {
  it("places stickers every h + gap mm", () => {
    const s = sanitizeSetup({ h: 40, gap: 2.6 });
    expect(pitch(s)).toBe(42.6);
  });

  it("puts a strip on one page of exactly N stickers", () => {
    const s = sanitizeSetup({ w: 50, h: 40, gap: 3, mode: "strip" });
    expect(pageGroups(s, 12)).toEqual([12]);
    expect(pageCss(s, [12])).toBe("@page { size: 50mm 516mm; margin: 0; }");
  });

  it("cuts long strips into pages under 5 m, with a shorter named last page", () => {
    const s = sanitizeSetup({ h: 40, gap: 3, mode: "strip" });
    expect(pageGroups(s, 250)).toEqual([100, 100, 50]);
    expect(pageCss(s, [100, 100, 50])).toContain("@page lbl-last { size: 50mm 2150mm;");
  });

  it("swaps the page for paysage", () => {
    const s = sanitizeSetup({ landscape: true, gap: 3 });
    expect(s.landscape).toBe(true);
    expect(pageCss(s, [2])).toBe("@page { size: 86mm 50mm; margin: 0; }");
  });

  it("lets the printer driver choose the page size", () => {
    const s = sanitizeSetup({ driverPage: true, landscape: true });
    expect(pageCss(s, [12])).toBe("@page { margin: 0; }");
    expect(pageGroups(s, 250)).toEqual([250]);
    expect(isLandscape(s)).toBe(false);
  });

  it("prints one page per sticker for label printers", () => {
    const s = sanitizeSetup({ mode: "pages", gap: 0 });
    expect(pageGroups(s, 3)).toEqual([1, 1, 1]);
    expect(pageCss(s, [1, 1, 1])).toBe("@page { size: 50mm 40mm; margin: 0; }");
  });

  it("widens the paper when the sticker is moved right", () => {
    expect(paperWidth(sanitizeSetup({ dx: 11 }))).toBe(61);
    expect(paperWidth(sanitizeSetup({ dx: -3 }))).toBe(50);
    expect(paperWidth(sanitizeSetup({ pageW: 72, dx: 11 }))).toBe(72);
  });

  it("keeps the margins (header / footer space) inside the sticker", () => {
    const s = sanitizeSetup({ top: 4, bottom: 3, left: 2, right: 1, dx: 1, dy: -0.5 });
    expect(contentBox(s)).toEqual({ x: 3, y: 3.5, w: 47, h: 33 });
    expect(contentSize({ ...s, rotate: 90 })).toEqual({ w: 33, h: 47 });
  });

  it("repairs broken saved settings", () => {
    const s = sanitizeSetup({ w: "abc", h: 9999, gap: -4, rotate: 45, mode: "x", top: 20, bottom: 20 });
    expect(s.w).toBe(DEFAULT_SETUP.w);
    expect(s.h).toBe(150);
    expect(s.gap).toBe(0);
    expect(s.rotate).toBe(0);
    expect(s.mode).toBe(DEFAULT_SETUP.mode);
    expect(sanitizeSetup({ top: 20, bottom: 20 }).top).toBe(0);
  });

  it("keeps the chosen lines, sizes and spacing", () => {
    const s = sanitizeSetup({ showShop: true, itemSize: 6, priceBold: false, showDigits: true, lineGap: 2.5, barH: 999 });
    expect([s.showShop, s.itemSize, s.priceBold, s.showDigits, s.lineGap, s.barH]).toEqual([true, 6, false, true, 2.5, 60]);
    expect([DEFAULT_SETUP.showShop, DEFAULT_SETUP.showDigits, DEFAULT_SETUP.priceBold]).toEqual([false, false, true]);
  });

  it("draws barcode bars on whole printer dots", () => {
    expect(barcodeFit(50)).toEqual({ width: 400 / 3, left: 19.17 });
    expect(barcodeFit(30).width).toBe(120);
  });

  it("moves a line with one finger, in the sticker's own direction", () => {
    const s = sanitizeSetup({});
    expect(moveBy(s, "price", 2, -1).moves.price).toEqual({ x: 2, y: -1 });
    // Content turned 90°: a finger moving right moves the line "up" in the sticker.
    const turned = moveBy(sanitizeSetup({ rotate: 90 }), "code", 3, 0).moves.code;
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(-3);
    expect(moveBy(s, "item", 500, 0).moves.item.x).toBe(60);
  });

  it("resizes a line with two fingers", () => {
    const s = sanitizeSetup({ priceSize: 14, barH: 12, barW: 80 });
    expect(resizeBy(s, "price", 1.5).priceSize).toBe(21);
    const code = resizeBy(s, "code", 1.5);
    expect([code.barH, code.barW]).toEqual([18, 100]);
    expect(resizeBy(s, "item", 0.01).itemSize).toBe(4);
  });

  it("keeps saved moves and repairs broken ones", () => {
    const s = sanitizeSetup({ moves: { price: { x: 3, y: "bad" }, code: null } });
    expect(s.moves.price).toEqual({ x: 3, y: 0 });
    expect(s.moves.code).toEqual({ x: 0, y: 0 });
    expect(resetMoves(s).moves.price).toEqual({ x: 0, y: 0 });
  });

  it("shares the look, keeps each device's printer settings", () => {
    const pc = sanitizeSetup({ gap: 2.6, dx: 3, mode: "strip", priceSize: 14, barH: 12 });
    const designed = sanitizeSetup({ gap: 0, dx: -1, mode: "pages", priceSize: 20, barH: 18, moves: { price: { x: 4, y: 0 } } });
    const look = lookOf(designed);
    expect(look).not.toHaveProperty("gap");
    expect(look).not.toHaveProperty("lookBase");
    const next = withLook(pc, JSON.parse(JSON.stringify(look)));
    expect([next.priceSize, next.barH, next.moves.price.x]).toEqual([20, 18, 4]);
    expect([next.gap, next.dx, next.mode]).toEqual([2.6, 3, "strip"]);
    expect(sameLook(next, designed)).toBe(true);
    expect(sameLook(pc, designed)).toBe(false);
    // A broken saved look falls back to the defaults, printer settings still kept.
    expect(withLook(pc, "garbage").gap).toBe(2.6);
  });
});
