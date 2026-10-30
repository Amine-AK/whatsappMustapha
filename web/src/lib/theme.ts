// Light / dark theme chosen in the app; "system" follows the phone or PC setting.
// The choice lives in localStorage and becomes data-theme on <html>.

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";
const BAR_COLOR = { light: "#0b5d46", dark: "#0f1714" };

const BAR_ID = "chosen-theme-color";

/**
 * Runs in <head> before the page paints, so a dark choice never flashes white.
 * The status bar colour goes in our own <meta>, put first in <head> so it wins
 * over the two Next.js ones (one per system setting), which React manages.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.createElement("meta");m.name="theme-color";m.id="${BAR_ID}";m.content=t==="dark"?"${BAR_COLOR.dark}":"${BAR_COLOR.light}";document.head.prepend(m)}}catch(e){}`;

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {}
  const root = document.documentElement;
  let bar = document.getElementById(BAR_ID) as HTMLMetaElement | null;
  if (theme === "system") {
    delete root.dataset.theme;
    bar?.remove();
    return;
  }
  root.dataset.theme = theme;
  if (!bar) {
    bar = document.createElement("meta");
    bar.name = "theme-color";
    bar.id = BAR_ID;
    document.head.prepend(bar);
  }
  bar.content = BAR_COLOR[theme];
}
