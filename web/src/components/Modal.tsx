"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Disable closing (e.g. while saving). */
  busy?: boolean;
}

// On a phone a dialog is a full screen page, so the phone's back button must
// close it instead of leaving the app. Open dialogs share one history entry:
// back closes the top one, and closing the last one by hand removes the entry.
type Open = { close: () => void; busy: () => boolean };
const stack: Open[] = [];
let hasEntry = false;
let skipPop = false;
let listening = false;

function pushEntry() {
  // Keep Next.js's own state so its router treats "back" as staying on this page.
  window.history.pushState({ ...window.history.state, dialog: true }, "");
  hasEntry = true;
}

function onPopState() {
  hasEntry = false;
  if (skipPop) {
    skipPop = false;
    // A dialog opened again before our own "back" landed: it needs its entry back.
    if (stack.length) pushEntry();
    return;
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.busy()) {
    pushEntry();
    return;
  }
  top.close();
  if (stack.length > 1) pushEntry();
}

function register(entry: Open) {
  if (!listening) {
    // Never removed: our own "back" must still be seen after the last dialog closes.
    window.addEventListener("popstate", onPopState);
    listening = true;
  }
  stack.push(entry);
  if (!hasEntry) pushEntry();
  return () => {
    stack.splice(stack.indexOf(entry), 1);
    if (stack.length) return;
    // Wait a tick: another dialog may open right away (form → receipt) and reuse the entry.
    setTimeout(() => {
      if (stack.length) return;
      if (hasEntry) {
        hasEntry = false;
        skipPop = true;
        window.history.back();
      }
    }, 0);
  };
}

export function Modal({ title, onClose, children, footer, busy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const unregister = register({ close: () => latest.current.onClose(), busy: () => Boolean(latest.current.busy) });
    return () => {
      unregister();
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn modal-close" onClick={onClose} disabled={busy} aria-label="سد">
            {/* ✕ on a PC; a back arrow on a phone, where the dialog is a page. */}
            <span className="on-wide">✕</span>
            <span className="on-phone">→</span>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
