import { BOT_TASKS_DEFAULTS, type BotTasksSettings } from "../../shared/bot-tasks.ts";
import type { AppConfig } from "../config.ts";

/** The saved `botTasks` section with every default filled in. */
export function botTasksSettings(cfg: Pick<AppConfig, "botTasks">): BotTasksSettings {
  const saved = cfg.botTasks ?? {};
  return {
    enabled: saved.enabled ?? BOT_TASKS_DEFAULTS.enabled,
    githubSync: saved.githubSync ?? BOT_TASKS_DEFAULTS.githubSync,
    pollMinutes: saved.pollMinutes ?? BOT_TASKS_DEFAULTS.pollMinutes,
    repos: [...(saved.repos ?? BOT_TASKS_DEFAULTS.repos)],
    credential: saved.credential ?? BOT_TASKS_DEFAULTS.credential,
    requireEvidenceForDone: saved.requireEvidenceForDone ?? BOT_TASKS_DEFAULTS.requireEvidenceForDone,
    requireEvidenceForReview: saved.requireEvidenceForReview ?? BOT_TASKS_DEFAULTS.requireEvidenceForReview,
    allowOutboundComments: saved.allowOutboundComments ?? BOT_TASKS_DEFAULTS.allowOutboundComments,
    allowMerge: saved.allowMerge ?? BOT_TASKS_DEFAULTS.allowMerge,
  };
}

/** What the app is shown: the settings and whether a token is saved, never the token. */
export function botTasksStatus(cfg: Pick<AppConfig, "botTasks">): BotTasksSettings & { githubTokenSet: boolean } {
  return { ...botTasksSettings(cfg), githubTokenSet: Boolean(cfg.botTasks?.githubToken) };
}

export const repoAllowed = (settings: Pick<BotTasksSettings, "repos">, repo: string): boolean => settings.repos.some((allowed) => allowed.toLowerCase() === repo.toLowerCase());
