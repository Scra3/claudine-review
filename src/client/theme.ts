// NOTE: The inline script in index.html duplicates loadTheme logic to prevent
// flash-of-wrong-theme before JS bundles load. Keep both in sync.
export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable
  }
  try {
    if (matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    // matchMedia may be unavailable
  }
  return "dark";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage may be unavailable
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#ffffff" : "#0d1117");
  }
}
