import { productCodes, type StockItem } from "./ledger";

// The shop's own barcode for a product: EAN-13 starting with 2. Numbers that
// start with 2 are kept for in-store use, so they never match a factory
// barcode. One code per product, stuck on every unit whatever the supplier.

/** Check digit of the first 12 digits of an EAN-13. */
export function ean13Check(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Check(code) === Number(code[12]);
}

/** A shop code (EAN-13 starting with 2). */
export const isShopCode = (code: string) => isEan13(code) && code.startsWith("2");

/** The shop code already on a product, if any. */
export function shopCodeOf(item: Pick<StockItem, "serial" | "codes">): string | undefined {
  return productCodes(item).find(isShopCode);
}

/**
 * A new shop code for a product. Made from the product's id, so two phones
 * offline give the same product the same code; `taken` skips codes already used.
 */
export function newShopCode(id: string, taken: Set<string>): string {
  for (let salt = 0; ; salt++) {
    // FNV-1a, 64-bit, kept to 11 digits.
    let h = 0xcbf29ce484222325n;
    for (const ch of salt ? `${id}#${salt}` : id) {
      h ^= BigInt(ch.codePointAt(0)!);
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    const first12 = "2" + (h % 100_000_000_000n).toString().padStart(11, "0");
    const code = first12 + ean13Check(first12);
    if (!taken.has(code.toLowerCase())) return code;
  }
}

/** Every code used in the stock, lower case. */
export const usedCodes = (stock: StockItem[]) => new Set(stock.flatMap((s) => productCodes(s).map((x) => x.toLowerCase())));

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The 95 modules of an EAN-13 ("1" = black bar). */
export function ean13Modules(code: string): string {
  if (!isEan13(code)) throw new Error("Not an EAN-13: " + code);
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[d[i]];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[d[i]];
  return out + "101";
}
