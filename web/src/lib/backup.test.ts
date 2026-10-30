import { describe, expect, it } from "vitest";
import { agoText, BACKUP_EVERY_MS, backupDue, SNOOZE_MS } from "./backup";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const HOUR = 60 * 60 * 1000;

describe("daily backup reminder", () => {
  it("asks when the last backup is 24 hours old, or was never done", () => {
    expect(backupDue(NOW, 0, 0)).toBe(true);
    expect(backupDue(NOW, NOW - BACKUP_EVERY_MS, 0)).toBe(true);
    expect(backupDue(NOW, NOW - 23 * HOUR, 0)).toBe(false);
  });

  it("waits while «من بعد» is running", () => {
    expect(backupDue(NOW, 0, NOW + SNOOZE_MS)).toBe(false);
    expect(backupDue(NOW + SNOOZE_MS, 0, NOW + SNOOZE_MS)).toBe(true);
  });

  it("says how long ago", () => {
    expect(agoText(0, NOW)).toBe("عمرها ما تدارت");
    expect(agoText(NOW - 30_000, NOW)).toBe("دابا");
    expect(agoText(NOW - 25 * 60_000, NOW)).toBe("قبل 25 دقيقة");
    expect(agoText(NOW - 5 * HOUR, NOW)).toBe("قبل 5 ساعة");
    expect(agoText(NOW - 50 * HOUR, NOW)).toBe("قبل 2 يوم");
  });
});
