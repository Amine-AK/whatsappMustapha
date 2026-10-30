"use client";

import { useEffect, useRef, useState } from "react";
import { agoText, downloadFile, fetchBackup, lastBackupAt, markBackupDone } from "@/lib/backup";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const THEMES: { value: Theme; icon: string; label: string }[] = [
  { value: "system", icon: "🌓", label: "تلقائي" },
  { value: "light", icon: "☀️", label: "فاتح" },
  { value: "dark", icon: "🌙", label: "داكن" },
];

interface Props {
  online: boolean;
  onSendBackup: () => void;
  onLogout: () => void;
  onToast: (msg: string) => void;
}

/** ⚙️ in the header: Excel backup, theme and logout. */
export function TopMenu({ online, onSendBackup, onLogout, onToast }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [downloading, setDownloading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setTheme(readTheme()), []);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function download() {
    setDownloading(true);
    try {
      downloadFile(await fetchBackup());
      markBackupDone();
      onToast("تحمل الملف ✓");
      setOpen(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn ghost menu-btn" aria-label="القائمة" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        ⚙️
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="القائمة">
          <p className="menu-label">النسخة الاحتياطية · آخر وحدة {agoText(lastBackupAt())}</p>
          <button type="button" role="menuitem" className="menu-item" onClick={() => void download()} disabled={!online || downloading}>
            {downloading ? "⏳ كنوجدو الملف…" : "⬇️ تحميل Excel"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={!online}
            onClick={() => {
              setOpen(false);
              onSendBackup();
            }}
          >
            📤 صيفط Excel فواتساب
          </button>
          <hr />
          <p className="menu-label">المظهر</p>
          <div className="segmented menu-theme" role="group" aria-label="المظهر">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={theme === t.value ? "on" : ""}
                aria-pressed={theme === t.value}
                onClick={() => {
                  applyTheme(t.value);
                  setTheme(t.value);
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <hr />
          <button type="button" role="menuitem" className="menu-item" onClick={onLogout} disabled={!online}>
            🚪 خروج
          </button>
        </div>
      )}
    </div>
  );
}
