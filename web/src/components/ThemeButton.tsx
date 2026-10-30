"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LOOK: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "🌓", label: "المظهر: حسب التيليفون" },
  light: { icon: "☀️", label: "المظهر: فاتح" },
  dark: { icon: "🌙", label: "المظهر: داكن" },
};

/** One tap: system → light → dark → system. */
export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => setTheme(readTheme()), []);

  const look = LOOK[theme];
  return (
    <button
      type="button"
      className="btn ghost theme-btn"
      aria-label={look.label}
      title={`${look.label} (ضغط باش تبدل)`}
      onClick={() => {
        const next = NEXT[theme];
        applyTheme(next);
        setTheme(next);
      }}
    >
      {look.icon}
    </button>
  );
}
