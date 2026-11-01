"use client";

import { useEffect, useRef, type RefObject } from "react";
import { charFromCode, MIN_CODE_LENGTH, SCAN_GAP_MS } from "@/lib/scanner-input";

function editable(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Catch a USB / Bluetooth barcode scanner when no field is selected: it types a
 * code much faster than a person, then Enter. Only for the screen in front: when
 * a window is open on top of `container`, the scan is ignored (and its Enter
 * doesn't press anything).
 */
export function useScannerInput(onCode: (code: string) => void, container: RefObject<HTMLElement | null>, enabled = true) {
  const report = useRef(onCode);
  useEffect(() => {
    report.current = onCode;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) {
        buffer = "";
        return;
      }
      const now = performance.now();
      if (e.key === "Enter" || e.key === "Tab") {
        const code = buffer.trim();
        buffer = "";
        if (code.length >= MIN_CODE_LENGTH && now - last < 300) {
          // A scan's Enter must never press the button that has the focus.
          e.preventDefault();
          e.stopPropagation();
          // A window on top (receipt, form…): the scan isn't for this screen.
          const dialogs = document.querySelectorAll("dialog[open]");
          const top = dialogs[dialogs.length - 1];
          if (!top || (container.current && top.contains(container.current))) report.current(code);
        }
        return;
      }
      let ch = charFromCode(e.code, e.shiftKey) ?? (e.key.length === 1 ? e.key : null);
      // Letters: the physical key says which one, the typed character says upper or lower case
      // (some scanners send capitals without Shift).
      if (ch && /^[a-z]$/i.test(ch) && e.key.length === 1 && /\p{L}/u.test(e.key)) ch = e.key === e.key.toUpperCase() ? ch.toUpperCase() : ch.toLowerCase();
      if (ch === null) return; // Shift and other keys pressed with the code
      if (now - last > SCAN_GAP_MS) buffer = "";
      buffer += ch;
      last = now;
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [container, enabled]);
}
