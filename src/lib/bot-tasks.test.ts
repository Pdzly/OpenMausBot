// Bot tasks' pure helpers: the list filters, the query sent to the server, the repo list a person types, and the rule
// that only https links on github.com are ever offered.
import { describe, expect, it } from "vitest";
import type { BotTaskSummary } from "../../shared/bot-tasks";
import {
  botTasksPatchBody, botTasksQuery, botTasksStatus, evidenceView, filterBotTasks, githubHref, githubRefHref, NO_FILTERS, parseRepos, pollMinutesValue, repoChoices,
} from "./bot-tasks";

const task = (over: Partial<BotTaskSummary>): BotTaskSummary => ({
  id: "t1", title: "Fix login", status: "open", ownerBotId: "b1", ownerName: "Lin", createdBy: { kind: "system" },
  createdAt: 1, updatedAt: 2, activityCount: 0, ...over,
} as BotTaskSummary);

const tasks = [
  task({ id: "t1", title: "Fix login redirect", status: "in_progress", ownerBotId: "b1", ownerName: "Lin", github: { repo: "linx-systems/clamui", number: 12, kind: "pull" } }),
  task({ id: "t2", title: "Write release notes", status: "done", ownerBotId: "b2", ownerName: "Rigel" }),
  task({ id: "t3", title: "Scan cache", status: "blocked", ownerBotId: "b1", ownerName: "Lin", github: { repo: "linx-systems/pi-sentinel", number: 4, kind: "issue" } }),
];
const ids = (list: BotTaskSummary[]) => list.map((one) => one.id);

describe("filterBotTasks", () => {
  it("keeps everything with no filters", () => expect(ids(filterBotTasks(tasks, NO_FILTERS))).toEqual(["t1", "t2", "t3"]));
  it("filters by status, owner and repo, together", () => {
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, status: "done" }))).toEqual(["t2"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, bot: "b1" }))).toEqual(["t1", "t3"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, repo: "LINX-SYSTEMS/ClamUI" }))).toEqual(["t1"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, bot: "b1", status: "blocked" }))).toEqual(["t3"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, bot: "b2", repo: "linx-systems/clamui" }))).toEqual([]);
  });
  it("matches every search word against title, id, owner and ref", () => {
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, q: "  LOGIN  " }))).toEqual(["t1"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, q: "lin cache" }))).toEqual(["t3"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, q: "clamui#12" }))).toEqual(["t1"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, q: "t2" }))).toEqual(["t2"]);
    expect(ids(filterBotTasks(tasks, { ...NO_FILTERS, q: "login rigel" }))).toEqual([]);
  });
});

describe("botTasksQuery", () => {
  it("sends only the filters that are set, search trimmed", () => {
    expect(botTasksQuery(NO_FILTERS)).toBe("");
    expect(botTasksQuery({ status: "review", bot: "b 1", repo: "o/r", q: "  a&b " })).toBe("?status=review&bot=b+1&repo=o%2Fr&q=a%26b");
    expect(botTasksQuery({ ...NO_FILTERS, q: "   " })).toBe("");
  });
});

describe("repoChoices", () => {
  it("lists the allowlist first, then other repos from tasks, without case repeats", () => {
    expect(repoChoices(["linx-systems/ClamUI", "a/b"], tasks)).toEqual(["linx-systems/ClamUI", "a/b", "linx-systems/pi-sentinel"]);
  });
});

describe("settings helpers", () => {
  it("reads repos one per line or by comma, pasted addresses included", () => {
    expect(parseRepos("linx-systems/clamui\nhttps://github.com/linx-systems/journalreader.git/, a/b\n\nLINX-SYSTEMS/clamui\nnot a repo"))
      .toEqual({ repos: ["linx-systems/clamui", "linx-systems/journalreader", "a/b"], invalid: ["not a repo"] });
    expect(parseRepos("  ")).toEqual({ repos: [], invalid: [] });
  });
  it("takes poll minutes from 1 to 1440 only", () => {
    expect(pollMinutesValue(" 5 ")).toBe(5);
    expect(pollMinutesValue("1440")).toBe(1440);
    for (const bad of ["0", "1441", "2.5", "-3", "", "five"]) expect(pollMinutesValue(bad)).toBeNull();
  });
  it("fills what the server left out with the defaults and no token", () => {
    expect(botTasksStatus(null)).toMatchObject({ enabled: false, pollMinutes: 5, githubTokenSet: false });
    expect(botTasksStatus({ botTasks: { ...botTasksStatus(null), enabled: true, githubTokenSet: true } })).toMatchObject({ enabled: true, githubTokenSet: true });
  });
  it("wraps a change in botTasks for PATCH /api/config", () => {
    expect(JSON.parse(botTasksPatchBody({ allowMerge: true }))).toEqual({ botTasks: { allowMerge: true } });
    expect(JSON.parse(botTasksPatchBody({ githubToken: null }))).toEqual({ botTasks: { githubToken: null } });
  });
});

describe("GitHub links", () => {
  it("offers only https addresses on github.com", () => {
    expect(githubHref("https://github.com/o/r/pull/1#issuecomment-2")).toBe("https://github.com/o/r/pull/1#issuecomment-2");
    for (const bad of ["http://github.com/o/r", "https://github.com.evil.io/o/r", "https://evil.io/github.com", "javascript:alert(1)",
      "https://user:pw@github.com/o/r", "https://github.com:8443/o/r", "https://gist.github.com/x", "not a url", "", undefined]) {
      expect(githubHref(bad), String(bad)).toBeUndefined();
    }
  });
  it("builds pull and issue addresses from a checked ref", () => {
    expect(githubRefHref({ repo: "o/r", number: 7, kind: "pull" })).toBe("https://github.com/o/r/pull/7");
    expect(githubRefHref({ repo: "o/r", number: 7, kind: "issue" })).toBe("https://github.com/o/r/issues/7");
    expect(githubRefHref({ repo: "o/r", number: 7 })).toBe("https://github.com/o/r/issues/7");
    expect(githubRefHref({ repo: "../evil", number: 7 })).toBeUndefined();
    expect(evidenceView({ kind: "commit", sha: "abcdef1" }, "../..")).toEqual({ kind: "commit", sha: "abcdef1" });
    expect(parseRepos("../x").invalid).toEqual(["../x"]);
    expect(githubRefHref({ repo: "o/r", number: 0 })).toBeUndefined();
  });
});

describe("evidenceView", () => {
  it("shortens a commit and links it in the task's repo", () => {
    expect(evidenceView({ kind: "commit", sha: "0123456789abcdef0123456789abcdef01234567" }, "o/r"))
      .toEqual({ kind: "commit", sha: "0123456", href: "https://github.com/o/r/commit/0123456789abcdef0123456789abcdef01234567" });
    expect(evidenceView({ kind: "commit", sha: "abcdef1", repo: "x/y" }, "o/r")).toEqual({ kind: "commit", sha: "abcdef1", repo: "x/y", href: "https://github.com/x/y/commit/abcdef1" });
    expect(evidenceView({ kind: "commit", sha: "abcdef1" })).toEqual({ kind: "commit", sha: "abcdef1" });
    expect(evidenceView({ kind: "commit", sha: "<b>not-a-sha</b>" }, "o/r")).toEqual({ kind: "commit", sha: "<b>not-a-sha</b>" });
  });
  it("links CI runs and reviews only on github.com", () => {
    expect(evidenceView({ kind: "ci_run", url: "https://github.com/o/r/actions/runs/9" })).toEqual({ kind: "ci_run", text: "https://github.com/o/r/actions/runs/9", href: "https://github.com/o/r/actions/runs/9" });
    expect(evidenceView({ kind: "review_url", url: "https://ci.example.com/9" })).toEqual({ kind: "review_url", text: "https://ci.example.com/9" });
  });
  it("tells a passing command from a failing one", () => {
    expect(evidenceView({ kind: "command", command: "pnpm test", exitCode: 0 })).toEqual({ kind: "command", command: "pnpm test", exitCode: 0, ok: true });
    expect(evidenceView({ kind: "command", command: "pnpm lint", exitCode: 2 })).toMatchObject({ ok: false });
  });
});
