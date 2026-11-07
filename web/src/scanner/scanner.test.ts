import { describe, expect, it } from "vitest";
import { createConfirmer } from "./confirm";
import { isValidRead, upcEToUpcA } from "./formats";
import { roiInVideo } from "./roi";

describe("scanner: check digits", () => {
  it("accepts valid EAN-13 / EAN-8 / UPC-A / UPC-E and rejects one wrong digit", () => {
    expect(isValidRead("ean_13", "4006381333931")).toBe(true);
    expect(isValidRead("ean_13", "4006381333932")).toBe(false);
    expect(isValidRead("ean_8", "96385074")).toBe(true);
    expect(isValidRead("ean_8", "96385075")).toBe(false);
    expect(isValidRead("upc_a", "036000291452")).toBe(true);
    expect(isValidRead("upc_a", "036000291453")).toBe(false);
    expect(upcEToUpcA("04252614")).toBe("042100005264");
    expect(isValidRead("upc_e", "04252614")).toBe(true);
    expect(isValidRead("upc_e", "04252615")).toBe(false);
  });
  it("keeps Code 128 as read, drops other formats and wrong lengths", () => {
    expect(isValidRead("code_128", "SN-AB12")).toBe(true);
    expect(isValidRead("qr_code", "hello")).toBe(false);
    expect(isValidRead("ean_13", "123")).toBe(false);
  });
});

describe("scanner: confirmation", () => {
  it("accepts a code only after 2 reads in a row", () => {
    const c = createConfirmer();
    expect(c.read("A", 0)).toBe(false);
    expect(c.read("A", 100)).toBe(true);
  });
  it("a different read in between starts again", () => {
    const c = createConfirmer();
    c.read("A", 0);
    expect(c.read("B", 50)).toBe(false);
    expect(c.read("A", 100)).toBe(false);
    expect(c.read("A", 150)).toBe(true);
  });
  it("ignores the same code while it stays in view, reads it again after 1.5 s away", () => {
    const c = createConfirmer();
    c.read("A", 0);
    c.read("A", 100);
    for (let t = 200; t < 5000; t += 100) expect(c.read("A", t)).toBe(false);
    // away from 4900 to 6500
    expect(c.read("A", 6500)).toBe(false);
    expect(c.read("A", 6600)).toBe(true);
  });
  it("after resume, the code still in front is not read on the spot", () => {
    const c = createConfirmer();
    c.read("A", 0);
    c.read("A", 100);
    c.resume(10_000);
    expect(c.read("A", 10_100)).toBe(false);
    expect(c.read("A", 10_200)).toBe(false);
    expect(c.read("B", 10_300)).toBe(false);
    expect(c.read("B", 10_400)).toBe(true);
  });
});

describe("scanner: decode region", () => {
  it("maps the guide rectangle onto a covered video", () => {
    // 1280×720 video in a 300×400 box: scaled ×0.5556, the box shows the middle 540 px.
    const r = roiInVideo(1280, 720, 300, 400);
    expect(r.w).toBe(432);
    expect(r.h).toBe(252);
    expect(r.x).toBe(424);
    expect(r.y).toBe(234);
  });
});
