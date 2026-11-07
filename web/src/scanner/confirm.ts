// When a decoded value becomes an accepted scan.
//
// - Accepted only when the same value is decoded in 2 successful decodes in a
//   row (within `pairWindowMs`): one misread frame never counts.
// - Then the same value is ignored while it stays in front of the camera, and
//   for `debounceMs` after it was last seen. So a code held still is read once;
//   the next unit of the same product is read after it left the view.
// - `resume()` (the parent re-enabled scanning): the code still in front is not
//   read again on the spot; it counts again once it has been away `debounceMs`.

export interface Confirmer {
  /** A successful decode of `value` at `now` (ms): true when it is accepted. */
  read(value: string, now: number): boolean;
  resume(now: number): void;
  reset(): void;
}

export function createConfirmer({ debounceMs = 1500, pairWindowMs = 1000 } = {}): Confirmer {
  let candidate: { value: string; at: number } | null = null;
  let last: { value: string; seenAt: number } | null = null;
  return {
    read(value, now) {
      // The last accepted code, still (or again too soon) in view: refresh and ignore.
      if (last && last.value === value && now - last.seenAt < debounceMs) {
        last.seenAt = now;
        candidate = null;
        return false;
      }
      if (candidate && candidate.value === value && now - candidate.at <= pairWindowMs) {
        candidate = null;
        last = { value, seenAt: now };
        return true;
      }
      candidate = { value, at: now };
      return false;
    },
    resume(now) {
      candidate = null;
      if (last) last.seenAt = now;
    },
    reset() {
      candidate = null;
      last = null;
    },
  };
}
