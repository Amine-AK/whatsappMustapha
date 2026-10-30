import { describe, expect, it } from "vitest";
import { listPayments } from "./sheet-logic";

describe("listPayments", () => {
  it("reads amounts and stamps, skipping empty parts", () => {
    expect(listPayments("1000 (01/10/2026 - 10:00) + 500 (25/10/2026 - 14:30) + 200")).toEqual([
      { amount: 1000, stamp: "01/10/2026 - 10:00" },
      { amount: 500, stamp: "25/10/2026 - 14:30" },
      { amount: 200, stamp: "" },
    ]);
    expect(listPayments("0")).toEqual([]);
  });
});
