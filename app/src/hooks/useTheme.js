import { useSyncExternalStore } from "react";

const KEY = "tenor-theme";
export const THEMES = ["system", "light", "dark"];

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

// One shared store so the header toggle and the footer switch always agree.
let current = read();
const listeners = new Set();

function apply(theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
}

export function setTheme(theme) {
  current = theme;
  apply(theme);
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** System / Light / Dark. The choice is remembered in this browser only. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => "system");
  return [theme, setTheme];
}
