import { describe, expect, it } from "vitest";
import {
  addMissingStamps,
  addMonths,
  appendPayment,
  dueStatus,
  findRowsMatching,
  formatMoroccoPhone,
  inputToRow,
  installmentLine,
  makeStamp,
  nextDateForPeriod,
  parseSheetDate,
  parseSum,
  rowChanged,
  rowMatchesInput,
  rowToCustomer,
  sameCell,
  stampInput,
  stripStamps,
  suggestNextDueDate,
  todayISO,
  validateInput,
  type CustomerInput,
} from "./sheet-logic";

const TODAY = "2026-10-28";

function sheetRow(over: Partial<Record<number, string>> = {}): string[] {
  const row = new Array(17).fill("");
  row[0] = "Ahmed";
  row[1] = "0661234567";
  row[2] = "TV (01/10/2026 - 10:00)";
  row[3] = "3000";
  row[4] = "2000";
  row[5] = "1000 درهم";
  row[6] = "1000 (01/10/2026 - 10:00)";
  row[7] = "2000 درهم";
  row[8] = "شهر";
  row[9] = "2026-10-20";
  row[13] = "500";
  for (const [k, v] of Object.entries(over)) row[Number(k)] = v ?? "";
  return row;
}

describe("amounts", () => {
  it("ignores the date stamps", () => {
    expect(parseSum("500 (01/10/2026 - 10:00) + 300 (05/10/2026 - 12:30)")).toBe(800);
  });
  it("reads French number formatting", () => {
    expect(parseSum("1 500,50")).toBe(1500.5);
  });
});

describe("phones", () => {
  it.each([
    ["0661234567", "212661234567"],
    ["+212 661-23-45-67", "212661234567"],
    ["00212661234567", "212661234567"],
    ["661234567", "212661234567"],
  ])("%s -> %s", (input, out) => expect(formatMoroccoPhone(input)).toBe(out));
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
  it("stamps like code.gs", () => {
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

describe("rows", () => {
  it("reads a sheet row", () => {
    const c = rowToCustomer(sheetRow(), 2, TODAY)!;
    expect(c).toMatchObject({
      row: 2,
      name: "Ahmed",
      phoneIntl: "212661234567",
      itemsPlain: "TV",
      sellTotal: 3000,
      paidTotal: 1000,
      remaining: 2000,
      profit: 1000,
      status: "overdue",
    });
  });
  it("skips empty rows", () => {
    expect(rowToCustomer(new Array(17).fill(""), 5, TODAY)).toBeNull();
  });
  it("detects changes by someone else", () => {
    const c = rowToCustomer(sheetRow(), 2, TODAY)!;
    expect(rowChanged(sheetRow(), c.expected)).toBe(false);
    expect(rowChanged(sheetRow({ 6: "3000" }), c.expected)).toBe(true);
    expect(rowChanged(sheetRow({ 5: "recalculated" }), c.expected)).toBe(false);
  });
  it("writes columns A..N in the sheet's format", () => {
    const input: CustomerInput = {
      name: "Fatima",
      phone: "0662112233",
      items: "Frigo + Micro (01/10/2026 - 10:00)",
      sell: "4000",
      buy: "3000",
      advance: "500",
      period: "سيمانة",
      dueDate: "2026-11-04",
      installment: "300",
    };
    const row = inputToRow(input, "28/10/2026 - 14:45", sheetRow({ 10: "keep me" }));
    expect(row).toEqual([
      "'Fatima",
      "'0662112233",
      "'Frigo (28/10/2026 - 14:45) + Micro (01/10/2026 - 10:00)",
      4000,
      3000,
      "'1000 درهم",
      "'500 (28/10/2026 - 14:45)",
      "'3500 درهم",
      "'سيمانة",
      "2026-11-04",
      "'keep me",
      "",
      "",
      300,
    ]);
  });
  it("never writes a formula", () => {
    const row = inputToRow(
      { name: "=IMPORTXML(1)", phone: "+212661234567", items: "x", sell: "1", buy: "", advance: "", period: "", dueDate: "", installment: "" },
      "s",
    );
    expect(row[0]).toBe("'=IMPORTXML(1)");
    expect(row[1]).toBe("'+212661234567");
  });
});

describe("payments", () => {
  it("appends a stamped payment", () => {
    expect(appendPayment("1000 (01/10/2026 - 10:00)", 500, "28/10/2026 - 14:45")).toBe(
      "1000 (01/10/2026 - 10:00) + 500 (28/10/2026 - 14:45)",
    );
    expect(appendPayment("0", 500, "s")).toBe("500 (s)");
  });
  it("suggests the next due date one period later", () => {
    expect(suggestNextDueDate({ period: "شهر", dueDate: "2026-10-20" }, TODAY)).toBe("2026-11-20");
    expect(suggestNextDueDate({ period: "تحديد يدوي", dueDate: "2026-10-20" }, TODAY)).toBe("2026-10-20");
    expect(suggestNextDueDate({ period: "سيمانة", dueDate: "" }, TODAY)).toBe("2026-11-04");
  });
});

describe("text helpers", () => {
  it("stamps only parts without one", () => {
    expect(addMissingStamps("TV (01/10/2026 - 10:00) + Frigo", "s")).toBe("TV (01/10/2026 - 10:00) + Frigo (s)");
  });
  it("strips stamps for display", () => {
    expect(stripStamps("TV (01/10/2026 - 10:00) + Frigo (02/10/2026 - 11:00)")).toBe("TV + Frigo");
  });
  it("builds the instalment line", () => {
    expect(installmentLine("500", "شهر")).toBe("500 درهم (كل شهر)");
    expect(installmentLine("", "تحديد يدوي")).toBe("حسب الاتفاق");
  });
  it("validates input", () => {
    const errors = validateInput({ name: "", phone: "123", items: "", sell: "", buy: "", advance: "", period: "", dueDate: "2026-02-31", installment: "" });
    expect(errors.map((e) => e.field)).toEqual(["name", "phone", "items", "sell", "dueDate"]);
  });
});

describe("sync-safe comparisons", () => {
  it("compares values, not how Sheets displays them", () => {
    expect(sameCell(9, "2026-11-04", "04/11/2026")).toBe(true);
    expect(sameCell(3, "1500.5", "1500,5")).toBe(true);
    expect(sameCell(3, "3000+500", "3500")).toBe(true);
    expect(sameCell(13, "حسب الاتفاق", "0")).toBe(false);
    expect(sameCell(0, "Ahmed  Ali", "Ahmed Ali")).toBe(true);
    expect(sameCell(9, "2026-11-04", "2026-11-05")).toBe(false);
  });
  it("finds a customer whose row number moved", () => {
    const c = rowToCustomer(sheetRow(), 2, TODAY)!;
    const other = sheetRow({ 0: "Fatima" });
    expect(findRowsMatching([other, sheetRow({ 9: "20/10/2026" })], c.expected)).toEqual([3]);
    expect(findRowsMatching([other], c.expected)).toEqual([]);
  });
  it("recognises a row that already has the new values", () => {
    const input = stampInput(
      { name: "Ahmed", phone: "0661234567", items: "TV", sell: "3000", buy: "2000", advance: "1000", period: "شهر", dueDate: "2026-10-20", installment: "500" },
      "01/10/2026 - 10:00",
    );
    expect(input.items).toBe("TV (01/10/2026 - 10:00)");
    expect(rowMatchesInput(sheetRow(), input)).toBe(true);
    expect(rowMatchesInput(sheetRow({ 6: "1500 (01/10/2026 - 10:00)" }), input)).toBe(false);
  });
});
