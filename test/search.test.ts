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
    const results = buildSearchResults("React", files, []);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.file)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns separate results when both comment body and thread reply match", () => {
    const comment = makeComment({
      file: "app.ts",
      line: 5,
      body: "We should refactor this function",
      thread: [{ author: "user", body: "I started refactoring yesterday" }],
    });
    const results = buildSearchResults("refactor", [], [comment]);
    expect(results).toHaveLength(2);
    expect(results[0].snippet).toBe("We should refactor this function");
    expect(results[1].snippet).toBe("I started refactoring yesterday");
    expect(results.every((r) => r.commentId === "c1")).toBe(true);
  });

  it("uses ln fallback for normal lines when ln2 is missing", () => {
    const file = makeFile("app.ts", [
      { type: "normal", content: " fallback line", ln: 12 },
    ]);
    const results = buildSearchResults("fallback", [file], []);
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe(12);
  });

  it("uses the from name for deleted files", () => {
    const file: DiffFile = {
      from: "removed.ts", to: "/dev/null",
      additions: 0, deletions: 1, new: false, deleted: true, renamed: false,
      chunks: [{ oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, content: "@@", changes: [
        { type: "del", content: "-deleted line", ln: 1 },
      ] }],
    };
    const results = buildSearchResults("deleted", [file], []);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("removed.ts");
  });

  it("returns one result per line even when query appears multiple times", () => {
    const file = makeFile("app.ts", [
      { type: "add", content: "+foo = foo + 1", ln: 3 },
    ]);
    const results = buildSearchResults("foo", [file], []);
    expect(results).toHaveLength(1);
  });

  it("preserves comment side field for old-side comments", () => {
    const comment = makeComment({
      file: "app.ts",
      line: 7,
      body: "This was wrong",
      side: "old",
    });
    const results = buildSearchResults("wrong", [], [comment]);
    expect(results).toHaveLength(1);
    expect(results[0].side).toBe("old");
  });

  it("finds matches across multiple chunks", () => {
    const file: DiffFile = {
      from: "app.ts", to: "app.ts",
      additions: 2, deletions: 0, new: false, deleted: false, renamed: false,
      chunks: [
        { oldStart: 1, oldLines: 5, newStart: 1, newLines: 5, content: "@@", changes: [
          { type: "add", content: "+first needle", ln: 3 },
        ] },
        { oldStart: 10, oldLines: 5, newStart: 10, newLines: 5, content: "@@", changes: [
          { type: "add", content: "+second needle", ln: 12 },
        ] },
      ],
    };
    const results = buildSearchResults("needle", [file], []);
    expect(results).toHaveLength(2);
    expect(results[0].line).toBe(3);
    expect(results[1].line).toBe(12);
  });
});

describe("truncateSnippet", () => {
  it("returns full text when short", () => {
    expect(truncateSnippet("hello world", "hello")).toBe("hello world");
  });

  it("centers the snippet around the match", () => {
    const text = "a".repeat(80) + "MATCH" + "b".repeat(80);
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

  it("does not add trailing ellipsis when match is near the end", () => {
    const text = "x".repeat(100) + "MATCH";
    const result = truncateSnippet(text, "MATCH");
    expect(result.startsWith("...")).toBe(true);
    expect(result.endsWith("...")).toBe(false);
    expect(result).toContain("MATCH");
  });

  it("is case-insensitive", () => {
    const text = "a".repeat(50) + "Hello" + "b".repeat(50);
    const result = truncateSnippet(text, "hello");
    expect(result).toContain("Hello");
  });
});
