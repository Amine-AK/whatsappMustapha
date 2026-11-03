"use client";

import { useEffect, useState } from "react";

// Owner: hide a total (credit, stock value, sales, profit) when customers can
// see the screen. Remembered per total on this device.

const MASK = "•••••";
const EVENT = "hide-amount-change";

export function useHiddenAmount(key: string): [boolean, () => void] {
  const storageKey = `hide-amount-${key}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setHidden(localStorage.getItem(storageKey) === "1");
      } catch {}
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, [storageKey]);
  return [
    hidden,
    () => {
      const next = !hidden;
      setHidden(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}

/** The amount, or dots when hidden. */
export const shown = (hidden: boolean, text: string) => (hidden ? MASK : text);

/** 👁️ button next to a total's label. */
export function EyeButton({ hidden, onToggle, what }: { hidden: boolean; onToggle: () => void; what: string }) {
  return (
    <button
      type="button"
      className="eye-btn"
      onClick={onToggle}
      aria-pressed={hidden}
      aria-label={hidden ? `بين ${what}` : `خبي ${what}`}
      title={hidden ? "بين" : "خبي"}
    >
      {hidden ? "🙈" : "👁️"}
    </button>
  );
}
