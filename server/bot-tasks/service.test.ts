import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_TASK_LIMITS, BOT_TASKS_DEFAULTS, type BotTaskActor, type BotTasksSettings } from "../../shared/bot-tasks.ts";
import { BotTaskError } from "./evidence.ts";
import { createBotTasks, type GithubPort, type GithubSyncResult } from "./service.ts";
import { BOT_TASKS_FILE } from "./store.ts";

const LIN: BotTaskActor = { kind: "bot", id: "lin", name: "Lin" };
const PIXEL: BotTaskActor = { kind: "bot", id: "pixel", name: "Pixel" };
const NAMES: Record<string, string> = { lin: "Lin", pixel: "Pixel" };
const COMMIT = [{ kind: "commit", sha: "950e39042" }];

let dir: string;
let settings: BotTasksSettings;
let clock: number;
let github: GithubPort | null;

const make = () => createBotTasks({ dataDir: dir, now: () => clock, settings: () => settings, botName: (id) => NAMES[id], github: () => github, log: () => {} });
const refused = (action: () => unknown, status: number, text?: RegExp) => {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BotTaskError);
    expect((error as BotTaskError).status).toBe(status);
    if (text) expect((error as BotTaskError).message).toMatch(text);
    return;
  }
  throw new Error("expected a refusal");
};
const refusedAsync = async (action: () => Promise<unknown>, status: number, text?: RegExp) => {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(BotTaskError);
    expect((error as BotTaskError).status).toBe(status);
    if (text) expect((error as BotTaskError).message).toMatch(text);
    return;
  }
  throw new Error("expected a refusal");
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "omb-bot-tasks-"));
  settings = { ...BOT_TASKS_DEFAULTS, enabled: true, githubSync: true, repos: ["Pdzly/OpenMausBot"] };
  clock = 1_000_000;
  github = null;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("creating and finding tasks", () => {
  it("opens a task with a created line and keeps it across a restart", () => {
    const tasks = make();
    const { task } = tasks.create({ title: "  Fix the   scan crash ", ownerBotId: "lin", by: LIN, text: "Crashes on empty files." });
    expect(task).toMatchObject({ title: "Fix the scan crash", status: "open", ownerBotId: "lin" });
    expect(task.activity.map((entry) => entry.type)).toEqual(["created", "comment"]);
    expect(make().get(task.id)).toMatchObject({ id: task.id, ownerName: "Lin" });
    expect(JSON.parse(readFileSync(join(dir, BOT_TASKS_FILE), "utf8")).version).toBe(1);
  });

  it("refuses an empty title and an owner that is no bot", () => {
    const tasks = make();
    refused(() => tasks.create({ title: "   ", ownerBotId: "lin", by: LIN }), 400);
    refused(() => tasks.create({ title: "x", ownerBotId: "ghost", by: LIN }), 400, /No bot/);
  });

  it("links the one pull request a title names, and only offers it when there are two", () => {
    const tasks = make();
    expect(tasks.create({ title: "Review linx-systems/clamui#370", ownerBotId: "lin", by: LIN }).task.github).toEqual({ repo: "linx-systems/clamui", number: 370 });
    const two = tasks.create({ title: "Compare a/b#1 with a/b#2", ownerBotId: "lin", by: LIN });
    expect(two.task.github).toBeUndefined();
    expect(two.suggested.map((ref) => ref.number)).toEqual([1, 2]);
  });

  it("takes an explicit reference over the text and refuses a malformed one", () => {
    const tasks = make();
    expect(tasks.create({ title: "x", ownerBotId: "lin", by: LIN, github: "https://github.com/Pdzly/OpenMausBot/pull/9" }).task.github).toEqual({ repo: "Pdzly/OpenMausBot", number: 9, kind: "pull" });
    refused(() => tasks.create({ title: "x", ownerBotId: "lin", by: LIN, github: "not a ref" }), 400);
  });

  it("links a reference a later comment names, once", () => {
    const tasks = make();
    const { task } = tasks.create({ title: "Look into it", ownerBotId: "lin", by: LIN });
    const after = tasks.comment(task.id, "It is a/b#7", LIN).task;
    expect(after.github).toEqual({ repo: "a/b", number: 7 });
    expect(tasks.comment(task.id, "also c/d#8", LIN).task.github).toEqual({ repo: "a/b", number: 7 });
  });

  it("filters by status, bot, repo and words, newest first", () => {
    const tasks = make();
    const a = tasks.create({ title: "Scanner fix", ownerBotId: "lin", by: LIN, github: "a/b#1" }).task;
    clock += 10;
    const b = tasks.create({ title: "Settings page", ownerBotId: "pixel", by: PIXEL }).task;
    clock += 10;
    tasks.setStatus(a.id, { status: "in_progress", by: LIN });
    expect(tasks.list().map((task) => task.id)).toEqual([a.id, b.id]);
    expect(tasks.list({ status: "open" }).map((task) => task.id)).toEqual([b.id]);
    expect(tasks.list({ botId: "lin" }).map((task) => task.id)).toEqual([a.id]);
    expect(tasks.list({ repo: "A/B" }).map((task) => task.id)).toEqual([a.id]);
    expect(tasks.list({ query: "settings pixel" }).map((task) => task.id)).toEqual([b.id]);
    expect(tasks.list({ limit: 1 })).toHaveLength(1);
  });

  it("announces every change after it is saved", () => {
    const tasks = make();
    const seen: string[] = [];
    tasks.onChange((id) => seen.push(id));
    const { task } = tasks.create({ title: "x", ownerBotId: "lin", by: LIN });
    tasks.comment(task.id, "note", LIN);
    expect(seen).toEqual([task.id, task.id]);
  });
});

describe("the evidence rule", () => {
  const open = () => { const tasks = make(); return { tasks, id: tasks.create({ title: "x", ownerBotId: "lin", by: LIN }).task.id }; };

  it("refuses done without evidence and changes nothing", () => {
    const { tasks, id } = open();
    refused(() => tasks.setStatus(id, { status: "done", by: LIN }), 422, /needs evidence/);
    expect(tasks.get(id).status).toBe("open");
    expect(tasks.get(id).activity).toHaveLength(1);
  });

  it("refuses done with only a failed command, accepts one that exited 0", () => {
    const { tasks, id } = open();
    refused(() => tasks.setStatus(id, { status: "done", evidence: [{ kind: "command", command: "pnpm test", exitCode: 1 }], by: LIN }), 422, /Only failed commands/);
    const done = tasks.setStatus(id, { status: "done", evidence: [{ kind: "command", command: "pnpm test", exitCode: 0 }], by: LIN });
    expect(done.status).toBe("done");
    expect(done.activity.at(-1)).toMatchObject({ type: "status", from: "open", to: "done", evidence: [{ kind: "command", exitCode: 0 }] });
  });

  it("accepts a commit, a CI run or a review link", () => {
    for (const evidence of [COMMIT, [{ kind: "ci_run", url: "https://github.com/a/b/actions/runs/1" }], [{ kind: "review_url", url: "https://github.com/a/b/pull/3#pullrequestreview-9" }]]) {
      const { tasks, id } = open();
      expect(tasks.setStatus(id, { status: "done", evidence, by: LIN }).status).toBe("done");
    }
  });

  it("rejects malformed evidence before anything else", () => {
    const { tasks, id } = open();
    refused(() => tasks.setStatus(id, { status: "done", evidence: [{ kind: "commit", sha: "zzz" }], by: LIN }), 400);
    refused(() => tasks.setStatus(id, { status: "done", evidence: [{ kind: "ci_run", url: "http://example.com/run" }], by: LIN }), 400);
    refused(() => tasks.setStatus(id, { status: "done", evidence: [{ kind: "review_url", url: "https://evil.example/a/b/pull/1" }], by: LIN }), 400);
    refused(() => tasks.setStatus(id, { status: "done", evidence: "abc", by: LIN }), 400);
    refused(() => tasks.setStatus(id, { status: "done", evidence: Array.from({ length: BOT_TASK_LIMITS.evidencePerMove + 1 }, () => COMMIT[0]), by: LIN }), 400);
  });

  it("does not ask for evidence when the setting is off, and asks for it on review when that is on", () => {
    const { tasks, id } = open();
    expect(tasks.setStatus(id, { status: "review", by: LIN }).status).toBe("review");
    settings = { ...settings, requireEvidenceForReview: true };
    const second = tasks.create({ title: "y", ownerBotId: "lin", by: LIN }).task.id;
    refused(() => tasks.setStatus(second, { status: "review", by: LIN }), 422);
    expect(tasks.setStatus(second, { status: "review", evidence: COMMIT, by: LIN }).status).toBe("review");
    settings = { ...settings, requireEvidenceForDone: false };
    expect(tasks.setStatus(second, { status: "done", by: LIN }).status).toBe("done");
  });

  it("links the pull request an evidence URL names", () => {
    const { tasks, id } = open();
    const done = tasks.setStatus(id, { status: "done", evidence: [{ kind: "review_url", url: "https://github.com/a/b/pull/3#pullrequestreview-9" }], by: LIN });
    expect(done.github).toMatchObject({ repo: "a/b", number: 3 });
  });

  it("refuses a repeat move without a note", () => {
    const { tasks, id } = open();
    refused(() => tasks.setStatus(id, { status: "open", by: LIN }), 409);
    expect(tasks.setStatus(id, { status: "open", comment: "still open", by: LIN }).activity.at(-1)).toMatchObject({ type: "comment" });
  });

  it("lets only the owner or the creator of a task move it, but any bot comment", () => {
    const tasks = make();
    const { task } = tasks.create({ title: "x", ownerBotId: "lin", by: LIN });
    refused(() => tasks.setStatus(task.id, { status: "in_progress", by: PIXEL }), 403);
    refused(() => tasks.setOwner(task.id, "pixel", PIXEL), 403);
    expect(tasks.comment(task.id, "hello", PIXEL).task.activity.at(-1)).toMatchObject({ type: "comment", by: PIXEL });
    expect(tasks.setOwner(task.id, "pixel", LIN).ownerBotId).toBe("pixel");
    expect(tasks.setStatus(task.id, { status: "in_progress", by: LIN }).status).toBe("in_progress");
    expect(tasks.setStatus(task.id, { status: "blocked", by: PIXEL }).status).toBe("blocked");
  });

  it("keeps a token out of the log", () => {
    const tasks = make();
    const { task } = tasks.create({ title: "x", ownerBotId: "lin", by: LIN });
    const noted = tasks.comment(task.id, "use ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD to push", LIN).task;
    expect(JSON.stringify(noted)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD");
  });
});

const IMPORTED = (extra: Partial<GithubSyncResult> = {}): GithubSyncResult => ({
  ref: { repo: "Pdzly/OpenMausBot", number: 5, kind: "issue" },
  githubState: { state: "open" },
  activity: [
    { key: "comment:1", at: 2_000_000, by: { kind: "github", login: "philipp" }, type: "github_comment", text: "Looks good", url: "https://github.com/Pdzly/OpenMausBot/issues/5#c1" },
    { key: "check:ci:abc:success", at: 2_000_100, by: { kind: "github", login: "github-actions" }, type: "github_check", name: "ci", conclusion: "success" },
  ],
  ...extra,
});
const port = (overrides: Partial<GithubPort> = {}): GithubPort => ({
  sync: vi.fn(async () => IMPORTED()),
  pull: vi.fn(async () => ({ kind: "pull" as const, state: "open" as const, mergeable: true })),
  postComment: vi.fn(async () => ({ id: 77, url: "https://github.com/Pdzly/OpenMausBot/issues/5#issuecomment-77" })),
  merge: vi.fn(async () => ({ merged: true, sha: "deadbeef" })),
  ...overrides,
});

describe("inbound GitHub sync", () => {
  const linked = () => { const tasks = make(); return { tasks, id: tasks.create({ title: "x", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#5" }).task.id }; };

  it("appends new outside events once, however often it runs", async () => {
    github = port();
    const { tasks, id } = linked();
    expect((await tasks.sync(id)).added).toBe(2);
    expect((await tasks.sync(id)).added).toBe(0);
    const task = tasks.get(id);
    expect(task.activity.filter((entry) => entry.key)).toHaveLength(2);
    expect(task).toMatchObject({ github: { kind: "issue" }, githubState: { state: "open" } });
  });

  it("never re-imports a comment the app posted itself", async () => {
    settings = { ...settings, allowOutboundComments: true };
    github = port({ sync: vi.fn(async () => IMPORTED({ activity: [{ key: "comment:77", at: 3_000_000, by: { kind: "github", login: "me" }, type: "github_comment", text: "Fixed in abc1234" }] })) });
    const { tasks, id } = linked();
    await tasks.post(id, { text: "Fixed in abc1234", by: LIN });
    expect((await tasks.sync(id)).added).toBe(0);
    expect(tasks.get(id).activity.some((entry) => entry.type === "github_comment")).toBe(false);
  });

  it("refuses without a reference, with sync off, off the allowlist and without a credential", async () => {
    github = port();
    const tasks = make();
    const bare = tasks.create({ title: "x", ownerBotId: "lin", by: LIN }).task.id;
    await refusedAsync(() => tasks.sync(bare), 409, /no GitHub reference/);
    const id = tasks.create({ title: "y", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#5" }).task.id;
    settings = { ...settings, githubSync: false };
    await refusedAsync(() => tasks.sync(id), 403, /sync is off/);
    expect((await tasks.sync(id, { force: true })).added).toBe(2);
    settings = { ...settings, repos: [] };
    await refusedAsync(() => tasks.sync(id, { force: true }), 403, /not on the allowed/);
    settings = { ...settings, repos: ["pdzly/openmausbot"] };
    github = null;
    await refusedAsync(() => tasks.sync(id, { force: true }), 503, /credential/);
  });

  it("notes a failing sync once and tells the caller", async () => {
    github = port({ sync: vi.fn(async () => { throw new Error("rate limited, token ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD"); }) });
    const { tasks, id } = linked();
    await refusedAsync(() => tasks.sync(id), 502, /sync failed/);
    await refusedAsync(() => tasks.sync(id), 502);
    const errors = tasks.get(id).activity.filter((entry) => entry.type === "sync_error");
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).not.toContain("ghp_");
  });

  it("polls only tasks that are open or lately finished, on allowed repos, and stops quietly when the switch is off", async () => {
    github = port();
    const tasks = make();
    const open = tasks.create({ title: "open", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#5" }).task.id;
    const old = tasks.create({ title: "old", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#6" }).task.id;
    tasks.setStatus(old, { status: "done", evidence: COMMIT, by: LIN });
    tasks.create({ title: "elsewhere", ownerBotId: "lin", by: LIN, github: "someone/else#1" });
    clock += 30 * 24 * 3_600_000;
    const result = await tasks.syncAll();
    expect(result).toMatchObject({ checked: 1, errors: 0 });
    expect(tasks.get(open).activity.some((entry) => entry.key)).toBe(true);
    expect(tasks.get(old).activity.some((entry) => entry.key)).toBe(false);
    settings = { ...settings, githubSync: false };
    expect(await tasks.syncAll()).toEqual({ checked: 0, added: 0, errors: 0 });
  });
});

describe("the explicit outbound comment", () => {
  const linked = () => { const tasks = make(); return { tasks, id: tasks.create({ title: "x", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#5" }).task.id }; };

  it("is off by default and posts nothing", async () => {
    github = port();
    const { tasks, id } = linked();
    await refusedAsync(() => tasks.post(id, { text: "done", by: LIN }), 403, /off/);
    expect(github.postComment).not.toHaveBeenCalled();
  });

  it("posts exactly one comment and records it", async () => {
    settings = { ...settings, allowOutboundComments: true };
    github = port();
    const { tasks, id } = linked();
    const result = await tasks.post(id, { text: "  Fixed in 950e390  ", by: LIN });
    expect(result).toMatchObject({ merged: false, url: expect.stringContaining("issuecomment-77") });
    expect(github.postComment).toHaveBeenCalledTimes(1);
    expect(github.postComment).toHaveBeenCalledWith({ repo: "Pdzly/OpenMausBot", number: 5 }, "Fixed in 950e390", id);
    expect(github.merge).not.toHaveBeenCalled();
    expect(tasks.get(id).activity.at(-1)).toMatchObject({ type: "posted", key: "comment:77" });
  });

  it("merges only with its own switch, checks the pull request first, and then comments", async () => {
    settings = { ...settings, allowOutboundComments: true };
    github = port();
    const { tasks, id } = linked();
    await refusedAsync(() => tasks.post(id, { text: "merging", merge: true, by: LIN }), 403, /Merging is off/);
    settings = { ...settings, allowMerge: true };
    const result = await tasks.post(id, { text: "merging", merge: true, by: LIN });
    expect(result.merged).toBe(true);
    expect((github.merge as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((github.postComment as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
    expect(tasks.get(id).activity.at(-1)).toMatchObject({ type: "posted", merged: true });
  });

  it("posts nothing when the merge is impossible", async () => {
    settings = { ...settings, allowOutboundComments: true, allowMerge: true };
    for (const pull of [{ kind: "issue" as const, state: "open" as const, mergeable: null }, { kind: "pull" as const, state: "merged" as const, mergeable: null }, { kind: "pull" as const, state: "open" as const, mergeable: false }]) {
      github = port({ pull: vi.fn(async () => pull) });
      const { tasks, id } = linked();
      await refusedAsync(() => tasks.post(id, { text: "merging", merge: true, by: LIN }), 409);
      expect(github.merge).not.toHaveBeenCalled();
      expect(github.postComment).not.toHaveBeenCalled();
    }
    github = port({ merge: vi.fn(async () => ({ merged: false, message: "checks failing" })) });
    const { tasks, id } = linked();
    await refusedAsync(() => tasks.post(id, { text: "merging", merge: true, by: LIN }), 502, /did not merge/);
    expect(github.postComment).not.toHaveBeenCalled();
  });

  it("refuses an unlinked task, a repo off the allowlist and an empty text", async () => {
    settings = { ...settings, allowOutboundComments: true };
    github = port();
    const tasks = make();
    const bare = tasks.create({ title: "x", ownerBotId: "lin", by: LIN }).task.id;
    await refusedAsync(() => tasks.post(bare, { text: "hi", by: LIN }), 409);
    const outside = tasks.create({ title: "x", ownerBotId: "lin", by: LIN, github: "linx-systems/clamui#370" }).task.id;
    await refusedAsync(() => tasks.post(outside, { text: "hi", by: LIN }), 403, /not on the allowed/);
    const id = tasks.create({ title: "y", ownerBotId: "lin", by: LIN, github: "Pdzly/OpenMausBot#5" }).task.id;
    await refusedAsync(() => tasks.post(id, { text: "   ", by: LIN }), 400);
    expect(github.postComment).not.toHaveBeenCalled();
  });

  it("lets a second post for the same task wait out the first", async () => {
    settings = { ...settings, allowOutboundComments: true };
    let release!: () => void;
    github = port({ postComment: vi.fn(() => new Promise<{ id: number; url: string }>((resolve) => { release = () => resolve({ id: 1, url: "https://github.com/x/y/issues/1#c" }); })) });
    const { tasks, id } = linked();
    const first = tasks.post(id, { text: "one", by: LIN });
    await refusedAsync(() => tasks.post(id, { text: "two", by: LIN }), 409, /already running/);
    release();
    await first;
    expect(github.postComment).toHaveBeenCalledTimes(1);
  });
});

describe("the log", () => {
  it("drops old imported lines and notes first when it is full, and keeps the status history", () => {
    const tasks = make();
    const { task } = tasks.create({ title: "x", ownerBotId: "lin", by: LIN });
    tasks.setStatus(task.id, { status: "in_progress", by: LIN });
    for (let index = 0; index < BOT_TASK_LIMITS.activityMax + 20; index++) tasks.comment(task.id, `note ${index}`, LIN);
    const log = tasks.get(task.id).activity;
    expect(log).toHaveLength(BOT_TASK_LIMITS.activityMax);
    expect(log.map((entry) => entry.type).slice(0, 2)).toEqual(["created", "status"]);
    expect(log.at(-1)).toMatchObject({ text: `note ${BOT_TASK_LIMITS.activityMax + 19}` });
  });

  it("starts empty from a damaged file and skips a damaged record", () => {
    writeFileSync(join(dir, BOT_TASKS_FILE), "{ not json");
    expect(make().list()).toEqual([]);
    writeFileSync(join(dir, BOT_TASKS_FILE), JSON.stringify({ version: 1, tasks: [{ id: "bad" }, { id: "t1", title: "ok", status: "open", ownerBotId: "lin", createdBy: { kind: "system" }, createdAt: 1, updatedAt: 1, activity: [] }] }));
    expect(make().list().map((task) => task.id)).toEqual(["t1"]);
  });
});
