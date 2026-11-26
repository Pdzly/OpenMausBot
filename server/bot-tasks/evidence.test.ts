import { describe, expect, it } from "vitest";

import { BotTaskError, githubRefsIn, parseEvidence, parseRef, supportsDone } from "./evidence.ts";

describe("evidence", () => {
  it("normalises a commit and keeps its repo", () => {
    expect(parseEvidence({ kind: "commit", sha: " 950E39042 ", repo: "Pdzly/OpenMausBot" })).toEqual({ kind: "commit", sha: "950e39042", repo: "Pdzly/OpenMausBot" });
  });

  it.each([
    [{ kind: "commit", sha: "12345" }],
    [{ kind: "commit", sha: "abcdefg" }],
    [{ kind: "commit", sha: "abcdef1", repo: "../x" }],
    [{ kind: "ci_run", url: "ftp://example.com/x" }],
    [{ kind: "ci_run", url: "https://user:pw@example.com/x" }],
    [{ kind: "review_url", url: "https://example.com/a/b/pull/1" }],
    [{ kind: "review_url", url: "https://github.com/a/b/tree/main" }],
    [{ kind: "command", command: "", exitCode: 0 }],
    [{ kind: "command", command: "x", exitCode: "0" }],
    [{ kind: "command", command: "x", exitCode: 0.5 }],
    [{ kind: "magic" }],
    ["abc"],
    [null],
  ])("refuses %j", (item) => {
    expect(() => parseEvidence(item)).toThrow(BotTaskError);
  });

  it("counts any proof except a failed command as support for done", () => {
    expect(supportsDone([])).toBe(false);
    expect(supportsDone([{ kind: "command", command: "x", exitCode: 2 }])).toBe(false);
    expect(supportsDone([{ kind: "command", command: "x", exitCode: 2 }, { kind: "commit", sha: "abcdef1" }])).toBe(true);
    expect(supportsDone([{ kind: "command", command: "x", exitCode: 0 }])).toBe(true);
  });
});

describe("GitHub references in text", () => {
  it("finds owner/repo#n and github.com links once each", () => {
    expect(githubRefsIn("see a/b#1, A/B#1 and https://github.com/c/d/pull/2 or https://github.com/c/d/issues/3")).toEqual([
      { repo: "c/d", number: 2, kind: "pull" }, { repo: "c/d", number: 3, kind: "issue" }, { repo: "a/b", number: 1 },
    ]);
  });

  it("ignores paths, versions and plain issue numbers", () => {
    expect(githubRefsIn("src/a/b#1 is not one, nor #12, v1.2.3#4, or http://github.com/a/b/pull/1")).toEqual([]);
  });

  it("parses exactly one reference", () => {
    expect(parseRef("Pdzly/OpenMausBot#5")).toEqual({ repo: "Pdzly/OpenMausBot", number: 5 });
    expect(() => parseRef("a/b#1 a/b#2")).toThrow(BotTaskError);
    expect(() => parseRef(5)).toThrow(BotTaskError);
  });
});
