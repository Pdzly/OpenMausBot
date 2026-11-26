// The task list for the app (docs/bot-tasks.md). Admin sessions only: request-auth.ts does not list these paths for members.
//   GET  /api/bot-tasks             { enabled, tasks } newest first; ?status=&bot=&repo=&q=
//   GET  /api/bot-tasks/:id         { task, ownerName }
//   POST /api/bot-tasks/:id/sync    { ok, task } polls the linked pull request or issue now, even when polling is off
//   POST /api/bot-tasks/:id/post    { ok, url, task } the person's own comment on GitHub, with merge: true to merge first
import { z } from "zod";

import { BOT_TASK_LIMITS, BOT_TASK_STATUSES, type BotTaskActor } from "../../shared/bot-tasks.ts";
import { BotTaskError } from "../bot-tasks/evidence.ts";
import type { BotTasks } from "../bot-tasks/service.ts";
import type { RequestAuth } from "../request-auth.ts";
import { PASS, type RouteHandler } from "./table.ts";

export const BOT_TASKS_PATH = "/api/bot-tasks";

export interface BotTasksRouteDeps {
  tasks: Pick<BotTasks, "list" | "get" | "sync" | "post">;
  enabled(): boolean;
  person(auth: RequestAuth): string;
}

const postSchema = z.object({ text: z.string().max(BOT_TASK_LIMITS.textMax), merge: z.boolean().optional() }).strict();

export function createBotTasksRoutes(deps: BotTasksRouteDeps): RouteHandler {
  return async ({ req, res, path, method, url, auth, json, readBody }) => {
    if (path !== BOT_TASKS_PATH && !path.startsWith(`${BOT_TASKS_PATH}/`)) return PASS;
    try {
      if (path === BOT_TASKS_PATH) {
        if (method !== "GET") return json(res, 405, { error: "Use GET." });
        if (!deps.enabled()) return json(res, 200, { enabled: false, tasks: [] });
        const status = url.searchParams.get("status") ?? "";
        if (status && !(BOT_TASK_STATUSES as readonly string[]).includes(status)) return json(res, 400, { error: `status is one of ${BOT_TASK_STATUSES.join(", ")}.` });
        const bot = url.searchParams.get("bot"), repo = url.searchParams.get("repo"), query = url.searchParams.get("q");
        return json(res, 200, {
          enabled: true,
          tasks: deps.tasks.list({ ...(status ? { status: status as (typeof BOT_TASK_STATUSES)[number] } : {}), ...(bot ? { botId: bot } : {}), ...(repo ? { repo } : {}), ...(query ? { query } : {}), limit: BOT_TASK_LIMITS.tasksMax }),
        });
      }
      if (!deps.enabled()) return json(res, 404, { error: "Bot tasks are off. Turn them on in Settings → Bot tasks." });
      const [, , , rawId, action, ...rest] = path.split("/");
      if (!rawId || rest.length) return json(res, 404, { error: "not found" });
      const id = decodeURIComponent(rawId);
      if (!action) {
        if (method !== "GET") return json(res, 405, { error: "Use GET." });
        const { ownerName, ...task } = deps.tasks.get(id);
        return json(res, 200, { task, ownerName });
      }
      if (method !== "POST") return json(res, 405, { error: "Use POST." });
      if (action === "sync") {
        const { task } = await deps.tasks.sync(id, { force: true });
        return json(res, 200, { ok: true, task });
      }
      if (action === "post") {
        const parsed = postSchema.safeParse(await readBody(req, 16_000).catch(() => null));
        if (!parsed.success) return json(res, 400, { error: "Send text (and merge: true to merge first)." });
        const by: BotTaskActor = { kind: "person", name: deps.person(auth) };
        const result = await deps.tasks.post(id, { text: parsed.data.text, ...(parsed.data.merge ? { merge: true } : {}), by });
        return json(res, 200, { ok: true, url: result.url, task: result.task });
      }
      return json(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof BotTaskError) return json(res, error.status, { error: error.message });
      throw error;
    }
  };
}
