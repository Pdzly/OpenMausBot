// @vitest-environment happy-dom
// Live bot tasks: a `bot-task` frame reloads the open list, and the open task only when it is the one that changed.
// Nothing polls: without a frame nothing is fetched again.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotTask, BotTaskSummary } from "../../../shared/bot-tasks";
import { announceBotTask } from "@/lib/bot-task-events";
import { botTasksStatus } from "@/lib/bot-tasks";
import { setLocale } from "@/lib/i18n";
import { BotTaskDetail } from "./BotTaskDetail";
import { BotTasksView } from "./BotTasksPage";

const summary = (id: string, title: string): BotTaskSummary => ({
  id, title, status: "open", ownerBotId: "b1", ownerName: "Lin", createdBy: { kind: "system" }, createdAt: 1, updatedAt: 2, activityCount: 0,
} as BotTaskSummary);

let host: HTMLDivElement;
let root: Root;
let listed: BotTaskSummary[];
let title: string;
const fetched: string[] = [];
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));

beforeEach(() => {
  setLocale("en");
  fetched.length = 0;
  listed = [summary("t1", "Fix login")];
  title = "Fix login";
  vi.stubGlobal("fetch", (input: string) => {
    const path = String(input);
    fetched.push(path);
    if (path.startsWith("/api/bot-tasks/")) return json({ task: { ...summary("t1", title), activity: [] } as unknown as BotTask, ownerName: "Lin" });
    return json({ enabled: true, tasks: listed });
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  root.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

const settings = botTasksStatus({ botTasks: { ...botTasksStatus(null), enabled: true } });

describe("live bot tasks", () => {
  it("reloads the open list when any task changes", async () => {
    flushSync(() => root.render(createElement(BotTasksView, { settings, bots: [], onOpenSettings: () => {}, openId: null, onOpen: () => {} })));
    await settle();
    expect(host.querySelectorAll("[data-bot-task-row]")).toHaveLength(1);
    const before = fetched.length;
    await settle();
    expect(fetched.length, "no polling").toBe(before);

    listed = [summary("t1", "Fix login"), summary("t2", "Write notes")];
    announceBotTask("t2");
    await settle();
    expect([...host.querySelectorAll<HTMLElement>("[data-bot-task-row]")].map((row) => row.dataset.botTaskRow)).toEqual(["t1", "t2"]);
  });

  it("reloads the open task only for its own id", async () => {
    flushSync(() => root.render(createElement(BotTaskDetail, { id: "t1", settings, botName: (id: string) => id, onChanged: () => {} })));
    await settle();
    expect(host.textContent).toContain("Fix login");
    const before = fetched.length;

    title = "Fix login redirect";
    announceBotTask("t9");
    await settle();
    expect(fetched.length, "another task changing fetches nothing").toBe(before);
    expect(host.textContent).not.toContain("Fix login redirect");

    announceBotTask("t1");
    await settle();
    expect(fetched.slice(before)).toEqual(["/api/bot-tasks/t1"]);
    expect(host.textContent).toContain("Fix login redirect");
  });
});
