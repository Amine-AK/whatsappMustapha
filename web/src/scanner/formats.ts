// The barcode formats the camera reads, and their check-digit validation:
// a misread EAN / UPC almost always fails its check digit, so it is dropped.

/** Product barcodes (the codes on the packaging). */
export const PRODUCT_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
/** 2D codes: QR and Data Matrix. */
export const QR_FORMATS = ["qr_code", "data_matrix"] as const;
/** Serial numbers / IMEI stickers and other 1D codes. */
export const SN_FORMATS = ["code_128", "code_39", "code_93", "itf", "codabar"] as const;
export const SCAN_FORMATS = [...PRODUCT_FORMATS, ...QR_FORMATS, ...SN_FORMATS] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

/** What a read is: a product barcode, a QR code, or a serial number (S/N). */
export type CodeKind = "barcode" | "qr" | "sn";
export function codeKind(format: string): CodeKind {
  if ((QR_FORMATS as readonly string[]).includes(format)) return "qr";
  if ((SN_FORMATS as readonly string[]).includes(format)) return "sn";
  return "barcode";
}

/** Check digit of `body` (all digits but the last), EAN / UPC rule: weights 3,1,3… from the right. */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** `code` (digits, check digit last) has a correct check digit. */
export function hasValidCheckDigit(code: string): boolean {
  return /^\d{2,}$/.test(code) && checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** UPC-E (8 digits: number system, 6 digits, check) → the UPC-A it stands for (12 digits). */
export function upcEToUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const m = code.slice(1, 7);
  const check = code[7];
  const last = m[5];
  let body: string;
  if (last <= "2") body = m[0] + m[1] + last + "0000" + m[2] + m[3] + m[4];
  else if (last === "3") body = m[0] + m[1] + m[2] + "00000" + m[3] + m[4];
  else if (last === "4") body = m[0] + m[1] + m[2] + m[3] + "00000" + m[4];
  else body = m[0] + m[1] + m[2] + m[3] + m[4] + "0000" + last;
  return ns + body + check;
}

/** A read worth keeping: one of our formats, with the right length and check digit. */
export function isValidRead(format: string, value: string): boolean {
  switch (format) {
    case "ean_13":
      return /^\d{13}$/.test(value) && hasValidCheckDigit(value);
    case "ean_8":
      return /^\d{8}$/.test(value) && hasValidCheckDigit(value);
    case "upc_a":
      return /^\d{12}$/.test(value) && hasValidCheckDigit(value);
    case "upc_e": {
      const a = upcEToUpcA(value);
      return a !== null && hasValidCheckDigit(a);
    }
    case "code_128":
    case "code_93":
    case "qr_code":
    case "data_matrix":
      // These have their own checksum / error correction, verified by the decoder.
      return value.trim().length > 0;
    case "code_39":
    case "itf":
    case "codabar":
      // No required checksum: very short reads are usually a misread.
      return value.trim().length >= 4;
    default:
      return false;
  }
}
