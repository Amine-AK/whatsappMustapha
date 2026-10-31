import { describe, expect, it } from "vitest";
import { charFromCode, fixAzertyDigits } from "./scanner-input";

describe("USB barcode scanner", () => {
  it("reads the physical keys, whatever the PC's layout", () => {
    // On AZERTY the key "Digit2" types "é", but the scanner meant "2".
    expect(["Digit6", "Digit2", "Digit9", "Digit1", "Digit0"].map((c) => charFromCode(c, false)).join("")).toBe("62910");
    expect(charFromCode("KeyQ", false)).toBe("q");
    expect(charFromCode("KeyA", true)).toBe("A");
    expect(charFromCode("Minus", false)).toBe("-");
    expect(charFromCode("Numpad7", false)).toBe("7");
    expect(charFromCode("ShiftLeft", true)).toBeNull();
  });

  it("repairs a number scanned into a field on an AZERTY PC", () => {
    expect(fixAzertyDigits("ç\"é&à'&(àà\"&\"")).toBe("9321041500313");
    expect(fixAzertyDigits("6291041500213")).toBe("6291041500213");
    // Real codes with a dash are left alone.
    expect(fixAzertyDigits("AB-1234")).toBe("AB-1234");
    expect(fixAzertyDigits("12-34")).toBe("12-34");
  });
});
