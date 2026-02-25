import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadTheme, saveTheme, applyTheme, THEME_KEY } from "../src/client/theme";

describe("loadTheme", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
    });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("returns 'dark' by default", () => {
    expect(loadTheme()).toBe("dark");
  });

  it("reads 'light' from localStorage", () => {
    storage[THEME_KEY] = "light";
    expect(loadTheme()).toBe("light");
  });

  it("reads 'dark' from localStorage", () => {
    storage[THEME_KEY] = "dark";
    expect(loadTheme()).toBe("dark");
  });

  it("respects prefers-color-scheme: light when no localStorage value", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(loadTheme()).toBe("light");
  });

  it("ignores invalid localStorage values", () => {
    storage[THEME_KEY] = "blue";
    expect(loadTheme()).toBe("dark");
  });

  it("ignores empty string in localStorage", () => {
    storage[THEME_KEY] = "";
    expect(loadTheme()).toBe("dark");
  });

  it("handles localStorage errors gracefully", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
    });
    expect(loadTheme()).toBe("dark");
  });

  it("handles localStorage undefined gracefully", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadTheme()).toBe("dark");
  });

  it("prefers localStorage value over system preference", () => {
    storage[THEME_KEY] = "dark";
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(loadTheme()).toBe("dark");
  });

  it("falls back to dark when both localStorage and matchMedia throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
    });
    vi.stubGlobal("matchMedia", () => { throw new Error("not supported"); });
    expect(loadTheme()).toBe("dark");
  });
});

describe("saveTheme", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  it("writes theme to localStorage", () => {
    saveTheme("light");
    expect(localStorage.setItem).toHaveBeenCalledWith(THEME_KEY, "light");
  });

  it("handles errors gracefully", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    expect(() => saveTheme("dark")).not.toThrow();
  });

  it("handles localStorage undefined gracefully", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveTheme("light")).not.toThrow();
  });
});

describe("applyTheme", () => {
  let setAttributeSpy: ReturnType<typeof vi.fn>;
  let metaEl: { setAttribute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    setAttributeSpy = vi.fn();
    vi.stubGlobal("document", {
      documentElement: { setAttribute: setAttributeSpy },
      querySelector: vi.fn(() => null),
    });
  });

  it("sets data-theme attribute to 'dark'", () => {
    applyTheme("dark");
    expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "dark");
  });

  it("sets data-theme attribute to 'light'", () => {
    applyTheme("light");
    expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "light");
  });

  it("updates meta theme-color to #ffffff for light", () => {
    metaEl = { setAttribute: vi.fn() };
    (document.querySelector as ReturnType<typeof vi.fn>).mockReturnValue(metaEl);

    applyTheme("light");
    expect(metaEl.setAttribute).toHaveBeenCalledWith("content", "#ffffff");
  });

  it("updates meta theme-color to #0d1117 for dark", () => {
    metaEl = { setAttribute: vi.fn() };
    (document.querySelector as ReturnType<typeof vi.fn>).mockReturnValue(metaEl);

    applyTheme("dark");
    expect(metaEl.setAttribute).toHaveBeenCalledWith("content", "#0d1117");
  });

  it("does not throw when meta theme-color element is absent", () => {
    expect(() => applyTheme("dark")).not.toThrow();
    expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "dark");
  });
});
