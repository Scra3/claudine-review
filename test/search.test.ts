import { describe, it, expect } from "vitest";
import { buildSearchResults, truncateSnippet } from "../src/client/search";
import type { DiffFile, Comment } from "../src/shared/types";

function makeFile(name: string, changes: { type: "add" | "del" | "normal"; content: string; ln?: number; ln1?: number; ln2?: number }[]): DiffFile {
  return {
    from: name,
    to: name,
    additions: changes.filter((c) => c.type === "add").length,
    deletions: changes.filter((c) => c.type === "del").length,
    new: false,
    deleted: false,
    renamed: false,
    chunks: [{
      oldStart: 1,
      oldLines: 10,
      newStart: 1,
      newLines: 10,
      content: "@@ -1,10 +1,10 @@",
      changes,
    }],
  };
}

function makeComment(overrides: Partial<Comment> & { file: string; line: number; body: string }): Comment {
  return {
    id: "c1",
    type: "comment",
    side: "new",
    status: "pending",
    response: null,
    thread: [],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

describe("buildSearchResults", () => {
  it("returns empty for blank query", () => {
    const file = makeFile("app.ts", [{ type: "add", content: "+hello", ln: 1 }]);
    expect(buildSearchResults("", [file], [])).toEqual([]);
    expect(buildSearchResults("   ", [file], [])).toEqual([]);
  });

  it("finds matches in added lines", () => {
    const file = makeFile("app.ts", [
      { type: "add", content: "+const foo = 42;", ln: 5 },
      { type: "add", content: "+const bar = 99;", ln: 6 },
    ]);
    const results = buildSearchResults("foo", [file], []);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "diff",
      file: "app.ts",
      line: 5,
      side: "new",
    });
  });

  it("finds matches in deleted lines", () => {
    const file = makeFile("app.ts", [
      { type: "del", content: "-old code", ln: 3 },
    ]);
    const results = buildSearchResults("old", [file], []);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "diff",
      file: "app.ts",
      line: 3,
      side: "old",
    });
  });

  it("finds matches in normal (context) lines", () => {
    const file = makeFile("app.ts", [
      { type: "normal", content: " context line with target", ln1: 7, ln2: 8 },
    ]);
    const results = buildSearchResults("target", [file], []);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "diff",
      file: "app.ts",
      line: 8,
      side: "new",
    });
  });

  it("is case-insensitive", () => {
    const file = makeFile("app.ts", [
      { type: "add", content: "+Hello World", ln: 1 },
    ]);
    expect(buildSearchResults("hello", [file], [])).toHaveLength(1);
    expect(buildSearchResults("HELLO", [file], [])).toHaveLength(1);
  });

  it("skips changes with undefined line numbers", () => {
    const file = makeFile("app.ts", [
      { type: "normal", content: " match here" },
    ]);
    const results = buildSearchResults("match", [file], []);
    expect(results).toHaveLength(0);
  });

  it("finds matches in comment bodies", () => {
    const comment = makeComment({
      file: "app.ts",
      line: 10,
      body: "This variable should be renamed",
    });
    const results = buildSearchResults("renamed", [], [comment]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "comment",
      file: "app.ts",
      line: 10,
      side: "new",
      commentId: "c1",
    });
  });

  it("finds matches in thread replies", () => {
    const comment = makeComment({
      file: "app.ts",
      line: 5,
      body: "nothing here",
      thread: [
        { author: "user", body: "I agree with the suggestion" },
        { author: "ai", body: "The fix looks correct" },
      ],
    });
    const results = buildSearchResults("suggestion", [], [comment]);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe("I agree with the suggestion");
  });

  it("finds matches in both diff and comments", () => {
    const file = makeFile("app.ts", [
      { type: "add", content: "+// TODO: refactor", ln: 1 },
    ]);
    const comment = makeComment({
      file: "app.ts",
      line: 1,
      body: "TODO: refactor this later",
    });
    const results = buildSearchResults("refactor", [file], [comment]);
    expect(results).toHaveLength(2);
    expect(results[0].type).toBe("diff");
    expect(results[1].type).toBe("comment");
  });

  it("returns multiple matches across files", () => {
    const files = [
      makeFile("a.ts", [{ type: "add", content: "+import React", ln: 1 }]),
      makeFile("b.ts", [{ type: "add", content: "+import React", ln: 1 }]),
    ];
    // Fix: makeFile sets both from and to to the same name, need distinct files
    files[1] = { ...files[1], from: "b.ts", to: "b.ts" };
    const results = buildSearchResults("React", files, []);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.file)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("truncateSnippet", () => {
  it("returns full text when short", () => {
    expect(truncateSnippet("hello world", "hello")).toBe("hello world");
  });

  it("centers the snippet around the match", () => {
    const text = "a".repeat(50) + "MATCH" + "b".repeat(50);
    const result = truncateSnippet(text, "MATCH");
    expect(result).toContain("MATCH");
    expect(result.startsWith("...")).toBe(true);
    expect(result.endsWith("...")).toBe(true);
  });

  it("does not add ellipsis when match is near the start", () => {
    const text = "MATCH" + "x".repeat(100);
    const result = truncateSnippet(text, "MATCH");
    expect(result.startsWith("...")).toBe(false);
    expect(result.endsWith("...")).toBe(true);
  });

  it("falls back to slicing when query not found", () => {
    const text = "x".repeat(200);
    const result = truncateSnippet(text, "notfound");
    expect(result.length).toBe(120);
  });

  it("is case-insensitive", () => {
    const text = "a".repeat(50) + "Hello" + "b".repeat(50);
    const result = truncateSnippet(text, "hello");
    expect(result).toContain("Hello");
  });
});
