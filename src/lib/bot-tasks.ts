import {
  BOT_TASK_STATUSES, BOT_TASKS_DEFAULTS, BOT_TASKS_POLL_MINUTES, REPO_PATTERN,
  type BotTask, type BotTaskEvidence, type BotTaskGithubRef, type BotTasksSettings, type BotTaskStatus, type BotTaskSummary,
} from "../../shared/bot-tasks";
import type { LocaleKey } from "@/locales";
import { api } from "@/state/api";

export type BotTasksStatus = BotTasksSettings & { githubTokenSet: boolean };

/** What `PATCH /api/config` takes under `botTasks`: `githubToken` is write-only, and null clears it. */
export type BotTasksPatch = Partial<BotTasksSettings> & { githubToken?: string | null };

export interface BotTaskFilters {
  status: BotTaskStatus | "";
  bot: string;
  repo: string;
  q: string;
}

export const NO_FILTERS: BotTaskFilters = { status: "", bot: "", repo: "", q: "" };

export const STATUS_LABEL: Record<BotTaskStatus, LocaleKey> = {
  open: "botTasks.status.open", in_progress: "botTasks.status.inProgress", blocked: "botTasks.status.blocked",
  review: "botTasks.status.review", done: "botTasks.status.done", cancelled: "botTasks.status.cancelled",
};

export const isBotTaskStatus = (value: string): value is BotTaskStatus => (BOT_TASK_STATUSES as readonly string[]).includes(value);

export function botTasksStatus(config: { botTasks?: BotTasksStatus } | null | undefined): BotTasksStatus {
  return { ...BOT_TASKS_DEFAULTS, githubTokenSet: false, ...config?.botTasks };
}

export function botTasksQuery(filters: BotTaskFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.bot) params.set("bot", filters.bot);
  if (filters.repo) params.set("repo", filters.repo);
  const q = filters.q.trim();
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The same filters the server applies, so a list already loaded narrows at once while the next answer is on its way. */
export function filterBotTasks(tasks: readonly BotTaskSummary[], filters: BotTaskFilters): BotTaskSummary[] {
  const words = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.bot && task.ownerBotId !== filters.bot) return false;
    if (filters.repo && task.github?.repo.toLowerCase() !== filters.repo.toLowerCase()) return false;
    if (!words.length) return true;
    const text = [task.title, task.id, task.ownerName, task.github ? `${task.github.repo}#${task.github.number}` : ""].join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Every repo the filter can offer: the allowlist first, then any other repo a loaded task points at. */
export function repoChoices(allowlist: readonly string[], tasks: readonly BotTaskSummary[]): string[] {
  const seen = new Map<string, string>();
  for (const repo of [...allowlist, ...tasks.flatMap((task) => (task.github ? [task.github.repo] : []))]) {
    if (!seen.has(repo.toLowerCase())) seen.set(repo.toLowerCase(), repo);
  }
  return [...seen.values()];
}

/** `owner/repo` as GitHub names it: the shared pattern, and neither part a `.` or `..` that would climb out of the path. */
export const isRepoName = (repo: string) => REPO_PATTERN.test(repo) && repo.split("/").every((part) => part !== "." && part !== "..");

// GitHub text and links come from outside: a link is offered only when it is an https address on github.com itself.
export function githubHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com" && !parsed.username && !parsed.password && !parsed.port ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function githubRefHref(ref: BotTaskGithubRef): string | undefined {
  if (!isRepoName(ref.repo) || !Number.isSafeInteger(ref.number) || ref.number < 1) return undefined;
  return `https://github.com/${ref.repo}/${ref.kind === "pull" ? "pull" : "issues"}/${ref.number}`;
}

export const githubRefLabel = (ref: BotTaskGithubRef) => `${ref.repo}#${ref.number}`;

export type EvidenceView =
  | { kind: "commit"; sha: string; repo?: string; href?: string }
  | { kind: "ci_run" | "review_url"; href?: string; text: string }
  | { kind: "command"; command: string; exitCode: number; ok: boolean };

const SHA = /^[0-9a-f]{7,40}$/i;

export function evidenceView(evidence: BotTaskEvidence, taskRepo?: string): EvidenceView {
  switch (evidence.kind) {
    case "commit": {
      const repo = evidence.repo ?? taskRepo;
      const sha = evidence.sha.trim();
      const href = repo && isRepoName(repo) && SHA.test(sha) ? `https://github.com/${repo}/commit/${sha}` : undefined;
      return { kind: "commit", sha: SHA.test(sha) ? sha.slice(0, 7) : sha, ...(evidence.repo ? { repo: evidence.repo } : {}), ...(href ? { href } : {}) };
    }
    case "ci_run":
    case "review_url": {
      const href = githubHref(evidence.url);
      return { kind: evidence.kind, text: evidence.url, ...(href ? { href } : {}) };
    }
    case "command":
      return { kind: "command", command: evidence.command, exitCode: evidence.exitCode, ok: evidence.exitCode === 0 };
  }
}

/** The repos a person typed, one per line or separated by commas: kept in order without repeats, and the lines that
 * are not `owner/repo` listed apart. A pasted GitHub address is read as its owner/repo. */
export function parseRepos(text: string): { repos: string[]; invalid: string[] } {
  const repos: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const line = raw.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/i, "");
    if (!line) continue;
    if (!isRepoName(line)) invalid.push(raw.trim());
    else if (!repos.some((repo) => repo.toLowerCase() === line.toLowerCase())) repos.push(line);
  }
  return { repos, invalid };
}

export function pollMinutesValue(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= BOT_TASKS_POLL_MINUTES.min && value <= BOT_TASKS_POLL_MINUTES.max ? value : null;
}

export const botTasksPatchBody = (patch: BotTasksPatch) => JSON.stringify({ botTasks: patch });

export interface BotTasksList { enabled: boolean; tasks: BotTaskSummary[] }
export interface BotTaskAnswer { task: BotTask; ownerName: string }

export const loadBotTasks = (filters: BotTaskFilters, signal?: AbortSignal) => api<BotTasksList>(`/api/bot-tasks${botTasksQuery(filters)}`, { signal });
export const loadBotTask = (id: string, signal?: AbortSignal) => api<BotTaskAnswer>(`/api/bot-tasks/${encodeURIComponent(id)}`, { signal });
export const syncBotTask = (id: string) => api<{ ok: true; task: BotTask }>(`/api/bot-tasks/${encodeURIComponent(id)}/sync`, { method: "POST" });
type ExpectedRef = Pick<BotTaskGithubRef, "repo" | "number">;
export const loadBotTaskMergeHead = (id: string, { repo, number }: ExpectedRef) => {
  const query = new URLSearchParams({ repo, number: String(number) });
  return api<{ sha: string }>(`/api/bot-tasks/${encodeURIComponent(id)}/merge-head?${query}`);
};
export const postBotTask = (id: string, text: string, { repo, number }: ExpectedRef, sha?: string) =>
  api<{ ok: true; url: string; task: BotTask }>(`/api/bot-tasks/${encodeURIComponent(id)}/post`, {
    method: "POST", body: JSON.stringify({ text, expectedRef: { repo, number }, ...(sha ? { merge: true, sha } : {}) }),
  });
