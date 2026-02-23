import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseSidebarWidth,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
  SIDEBAR_MIN,
  SIDEBAR_DEFAULT,
  SIDEBAR_KEY,
} from "../src/client/sidebar";

describe("parseSidebarWidth", () => {
  it("returns default for null", () => {
    expect(parseSidebarWidth(null)).toBe(SIDEBAR_DEFAULT);
  });

  it("parses a valid number", () => {
    expect(parseSidebarWidth("300")).toBe(300);
  });

  it("returns default for NaN input", () => {
    expect(parseSidebarWidth("abc")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for empty string", () => {
    expect(parseSidebarWidth("")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for whitespace-only string", () => {
    expect(parseSidebarWidth("  ")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for 'NaN'", () => {
    expect(parseSidebarWidth("NaN")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for 'undefined'", () => {
    expect(parseSidebarWidth("undefined")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for 'null'", () => {
    expect(parseSidebarWidth("null")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for Infinity", () => {
    expect(parseSidebarWidth("Infinity")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for negative Infinity", () => {
    expect(parseSidebarWidth("-Infinity")).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default for value below minimum", () => {
    expect(parseSidebarWidth("100")).toBe(SIDEBAR_DEFAULT);
    expect(parseSidebarWidth("0")).toBe(SIDEBAR_DEFAULT);
    expect(parseSidebarWidth("-50")).toBe(SIDEBAR_DEFAULT);
  });

  it("accepts value exactly at minimum", () => {
    expect(parseSidebarWidth(String(SIDEBAR_MIN))).toBe(SIDEBAR_MIN);
  });

  it("accepts large valid values", () => {
    expect(parseSidebarWidth("1000")).toBe(1000);
  });

  it("handles float values", () => {
    expect(parseSidebarWidth("260.5")).toBe(260.5);
  });
});

describe("clampSidebarWidth", () => {
  it("clamps to minimum when clientX is too small", () => {
    expect(clampSidebarWidth(50, 1200)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(0, 1200)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(-100, 1200)).toBe(SIDEBAR_MIN);
  });

  it("clamps to 50% of viewport when clientX is too large", () => {
    expect(clampSidebarWidth(800, 1200)).toBe(600);
    expect(clampSidebarWidth(1200, 1200)).toBe(600);
  });

  it("returns clientX when within bounds", () => {
    expect(clampSidebarWidth(300, 1200)).toBe(300);
    expect(clampSidebarWidth(SIDEBAR_MIN, 1200)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(600, 1200)).toBe(600);
  });

  it("handles small viewport where 50% is below minimum", () => {
    // 50% of 200 = 100; max cap wins over min floor (CSS min-width handles the rest)
    expect(clampSidebarWidth(50, 200)).toBe(100);
    expect(clampSidebarWidth(300, 200)).toBe(100);
  });
});

describe("loadSidebarWidth", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
    });
  });

  it("returns saved value from localStorage", () => {
    storage[SIDEBAR_KEY] = "400";
    expect(loadSidebarWidth()).toBe(400);
  });

  it("returns default when localStorage is empty", () => {
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default when localStorage has corrupt data", () => {
    storage[SIDEBAR_KEY] = "not-a-number";
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
    });
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT);
  });

  it("returns default when localStorage is undefined", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT);
  });
});

describe("saveSidebarWidth", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  it("writes width to localStorage", () => {
    saveSidebarWidth(350);
    expect(localStorage.setItem).toHaveBeenCalledWith(SIDEBAR_KEY, "350");
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    expect(() => saveSidebarWidth(350)).not.toThrow();
  });

  it("does not throw when localStorage is undefined", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveSidebarWidth(350)).not.toThrow();
  });
});
