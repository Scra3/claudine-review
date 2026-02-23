export const SIDEBAR_MIN = 160;
export const SIDEBAR_DEFAULT = 260;
export const SIDEBAR_KEY = "sidebar-width";

export function parseSidebarWidth(raw: string | null): number {
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= SIDEBAR_MIN) {
      return parsed;
    }
  }
  return SIDEBAR_DEFAULT;
}

export function clampSidebarWidth(clientX: number, viewportWidth: number): number {
  return Math.min(Math.max(clientX, SIDEBAR_MIN), viewportWidth * 0.5);
}

export function loadSidebarWidth(): number {
  try {
    return parseSidebarWidth(localStorage.getItem(SIDEBAR_KEY));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(width));
  } catch {
    // localStorage may be unavailable (sandboxed iframe, private mode, etc.)
  }
}
