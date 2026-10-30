import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, crc32, sheetNames } from "./xlsx";

/** Files inside the zip, read back through the central directory. */
function unzip(buf: Buffer): Record<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = inflateRawSync(buf.subarray(dataStart, dataStart + size));
    expect(crc32(data)).toBe(buf.readUInt32LE(at + 16));
    out[name] = data.toString("utf8");
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}

describe("Excel backup", () => {
  it("names columns and sheets the way Excel wants", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(701)]).toEqual(["A", "Z", "AA", "ZZ"]);
    expect(sheetNames(["الزبناء", "a/b", "x".repeat(40), "الزبناء"])).toEqual(["الزبناء", "a b", "x".repeat(31), "الزبناء~2"]);
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("writes every tab with numbers as numbers and text as text", () => {
    const files = unzip(
      buildXlsx([
        { name: "الزبناء", rows: [["رقم الزبون", "الاسم", "الهاتف", "المتبقي"], ["C-1", "سعاد <أخت سمير> & co", "0661234567", 1500.5]] },
        { name: "الدفعات", rows: [] },
      ]),
    );
    expect(Object.keys(files)).toContain("xl/worksheets/sheet2.xml");
    expect(files["xl/workbook.xml"]).toContain('<sheet name="الزبناء" sheetId="1" r:id="rId1"/>');
    const sheet = files["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">رقم الزبون</t></is></c>');
    expect(sheet).toContain("سعاد &lt;أخت سمير&gt; &amp; co");
    // The phone keeps its leading 0; the amount stays a number.
    expect(sheet).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">0661234567</t></is></c>');
    expect(sheet).toContain('<c r="D2"><v>1500.5</v></c>');
  });
});
