// Icons and labels for the System / Light / Dark theme controls.
export const THEME_ICONS = {
  system: <path d="M3 4h14v9H3zM7 16h6" />,
  light: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
  dark: <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />,
};
export const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };
