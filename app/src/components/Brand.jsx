import { THEMES, useTheme } from "../hooks/useTheme";
import { THEME_ICONS, THEME_LABEL } from "./themeIcons";

/** The Tenor mark: a split coin. Solid half = PT (fixed), dashed half = YT (variable). */
export function LogoMark({ size = 28, className = "" }) {
  return (
    <svg className={`logo-mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M14.5 4.5A11.5 11.5 0 0 0 14.5 27.5Z" fill="currentColor" />
      <path
        d="M17.5 6A10 10 0 0 1 25.16 9.572M26.563 11.774A10 10 0 0 1 26.563 20.226M25.16 22.428A10 10 0 0 1 17.5 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}


/** Header control: one icon button that cycles System, Light, Dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return (
    <button
      type="button"
      className="icon-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}.`}
      title={`Theme: ${THEME_LABEL[theme]}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">{THEME_ICONS[theme]}</svg>
    </button>
  );
}
