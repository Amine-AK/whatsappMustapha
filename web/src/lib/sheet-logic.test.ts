import { describe, expect, it } from "vitest";
import {
  addMonths,
  dueStatus,
  formatAmount,
  formatMoroccoPhone,
  installmentLine,
  isValidPhone,
  makeStamp,
  nextDateForPeriod,
  parseSheetDate,
  parseSum,
  stripStamps,
  todayISO,
} from "./sheet-logic";

const TODAY = "2026-10-28";

describe("amounts", () => {
  it("ignores the date stamps", () => {
    expect(parseSum("500 (01/10/2026 - 10:00) + 300 (05/10/2026 - 12:30)")).toBe(800);
  });
  it("reads French number formatting", () => {
    expect(parseSum("1 500,50")).toBe(1500.5);
  });
  it("prints amounts without useless decimals", () => {
    expect([formatAmount(1500), formatAmount(12.5), formatAmount(0.1 + 0.2)]).toEqual(["1500", "12.5", "0.3"]);
  });
});

describe("phones", () => {
  it.each([
    ["0661234567", "212661234567"],
    ["+212 661-23-45-67", "212661234567"],
    ["00212661234567", "212661234567"],
    ["661234567", "212661234567"],
  ])("%s -> %s", (input, out) => expect(formatMoroccoPhone(input)).toBe(out));
  it("rejects numbers that are too short", () => {
    expect(isValidPhone(formatMoroccoPhone("123"))).toBe(false);
  });
});

describe("dates", () => {
  it("parses the formats a sheet can show", () => {
    expect(parseSheetDate("2026-10-28")).toBe(TODAY);
    expect(parseSheetDate("28/10/2026")).toBe(TODAY);
    expect(parseSheetDate("46323")).toBe("2026-10-28");
    expect(parseSheetDate("pas encore")).toBe("");
    expect(parseSheetDate("31/02/2026")).toBe("");
  });
  it("moves by period", () => {
    expect(nextDateForPeriod("سيمانة", TODAY)).toBe("2026-11-04");
    expect(nextDateForPeriod("15 يوم", TODAY)).toBe("2026-11-12");
    expect(nextDateForPeriod("شهر", "2026-01-31")).toBe("2026-02-28");
    expect(nextDateForPeriod("تحديد يدوي", TODAY)).toBe("");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("uses the Casablanca day", () => {
    // 23:30 UTC on Oct 27 is already Oct 28 in Casablanca (UTC+1)
    expect(todayISO(new Date("2026-10-27T23:30:00Z"))).toBe("2026-10-28");
  });
  it("stamps in shop time", () => {
    expect(makeStamp("2026-10-05", new Date("2026-10-28T13:45:00Z"))).toBe("05/10/2026 - 14:45");
  });
});

describe("status", () => {
  it("classifies due dates", () => {
    expect(dueStatus("2026-10-20", 100, TODAY)).toBe("overdue");
    expect(dueStatus(TODAY, 100, TODAY)).toBe("today");
    expect(dueStatus("2026-10-29", 100, TODAY)).toBe("tomorrow");
    expect(dueStatus("2026-11-20", 100, TODAY)).toBe("upcoming");
    expect(dueStatus("", 100, TODAY)).toBe("nodate");
    expect(dueStatus("2026-10-20", 0, TODAY)).toBe("paid");
  });
});

describe("text helpers", () => {
  it("strips stamps for display", () => {
    expect(stripStamps("TV (01/10/2026 - 10:00) + Frigo (02/10/2026 - 11:00)")).toBe("TV + Frigo");
  });
  it("builds the instalment line", () => {
    expect(installmentLine("500", "شهر")).toBe("500 درهم (كل شهر)");
    expect(installmentLine("", "تحديد يدوي")).toBe("حسب الاتفاق");
  });
});
