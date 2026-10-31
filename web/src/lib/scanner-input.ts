// USB / Bluetooth barcode scanners act as keyboards: they type the code very
// fast, then Enter. Helpers to recognise that, whatever the PC's keyboard layout.

/**
 * Most scanners type as if the keyboard were American (QWERTY). On a French
 * AZERTY PC the digit keys then give & é " ' ( - è _ ç à. The physical key
 * (KeyboardEvent.code) is the same on every layout, so read that instead.
 */
const DIGITS: Record<string, string> = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Digit${i}`, String(i)]));
const SHIFTED: Record<string, string> = { Digit1: "!", Digit2: "@", Digit3: "#", Digit4: "$", Digit5: "%", Digit6: "^", Digit7: "&", Digit8: "*", Digit9: "(", Digit0: ")" };
const PUNCT: Record<string, [string, string]> = {
  Minus: ["-", "_"], Equal: ["=", "+"], Slash: ["/", "?"], Period: [".", ">"], Comma: [",", "<"], Semicolon: [";", ":"],
  Quote: ["'", '"'], BracketLeft: ["[", "{"], BracketRight: ["]", "}"], Backslash: ["\\", "|"], Backquote: ["`", "~"], Space: [" ", " "],
};

/** The character a US-layout scanner meant, from the physical key. Null for keys that are not part of a code. */
export function charFromCode(code: string, shift: boolean): string | null {
  if (/^Key[A-Z]$/.test(code)) return shift ? code[3] : code[3].toLowerCase();
  if (code in DIGITS) return shift ? SHIFTED[code] : DIGITS[code];
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (code in PUNCT) return PUNCT[code][shift ? 1 : 0];
  return null;
}

const AZERTY_DIGITS: Record<string, string> = { "&": "1", "é": "2", '"': "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0" };

/**
 * A number scanned into a text field on an AZERTY PC ("&é\"'(" for "12345").
 * Only changed when it is clearly that: made only of those characters and digits,
 * with at least one accented one or "&", so real codes with "-" are left alone.
 */
export function fixAzertyDigits(text: string): string {
  const t = text.trim();
  if (!t || ![...t].every((c) => c in AZERTY_DIGITS || /\d/.test(c)) || !/[&éèçà]/.test(t)) return t;
  return [...t].map((c) => AZERTY_DIGITS[c] ?? c).join("");
}

/** Keys typed faster than this (ms apart) come from a scanner, not a person. */
export const SCAN_GAP_MS = 45;
export const MIN_CODE_LENGTH = 4;
