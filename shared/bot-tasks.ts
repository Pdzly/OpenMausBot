// Bot tasks: the bots-only task ledger (docs/bot-tasks.md). These are the wire types the server, the bot tools and the app
// share; the server keeps them in `bot-tasks.json` in the data folder.

export const BOT_TASK_STATUSES = ["open", "in_progress", "blocked", "review", "done", "cancelled"] as const;
export type BotTaskStatus = (typeof BOT_TASK_STATUSES)[number];

export const BOT_TASK_LIMITS = {
  titleMax: 160,
  textMax: 4000,
  activityMax: 400,
  tasksMax: 2000,
  evidencePerMove: 10,
  listMax: 50,
} as const;

/** A pull request or an issue on GitHub, as `owner/repo#number`. `kind` is learned from GitHub on the first sync. */
export interface BotTaskGithubRef {
  repo: string;
  number: number;
  kind?: "pull" | "issue";
}

/** What backs a claim that work is done: one of these is needed to move a task to done (and to review, when that setting is on). */
export type BotTaskEvidence =
  | { kind: "commit"; sha: string; repo?: string }
  | { kind: "ci_run"; url: string }
  | { kind: "review_url"; url: string }
  | { kind: "command"; command: string; exitCode: number };

export type BotTaskActor = { kind: "bot"; id: string; name: string } | { kind: "person"; name: string } | { kind: "github"; login: string } | { kind: "system" };

/** One line of a task's append-only log. `key` is set for events imported from GitHub, so a later poll never adds one twice. */
export type BotTaskActivity = {
  id: string;
  at: number;
  by: BotTaskActor;
  key?: string;
} & (
  | { type: "created" }
  | { type: "comment"; text: string }
  | { type: "status"; from: BotTaskStatus; to: BotTaskStatus; evidence?: BotTaskEvidence[] }
  | { type: "owner"; from?: string; to: string }
  | { type: "github_ref"; ref: BotTaskGithubRef }
  | { type: "github_comment"; text: string; url?: string }
  | { type: "github_review"; state: string; text: string; url?: string }
  | { type: "github_check"; name: string; conclusion: string; url?: string }
  | { type: "github_state"; state: "merged" | "closed" | "reopened"; url?: string }
  | { type: "posted"; url: string; merged?: boolean }
  | { type: "sync_error"; text: string }
);

export interface BotTask {
  id: string;
  title: string;
  status: BotTaskStatus;
  ownerBotId: string;
  createdBy: BotTaskActor;
  createdAt: number;
  updatedAt: number;
  github?: BotTaskGithubRef;
  /** The last GitHub state seen by a sync; used only to show it and to detect changes. */
  githubState?: { state: "open" | "closed" | "merged"; syncedAt: number };
  activity: BotTaskActivity[];
}

export interface BotTaskSummary extends Omit<BotTask, "activity"> {
  ownerName: string;
  activityCount: number;
}

/** `botTasks` in config.json, and what Settings shows. The GitHub token is never sent to the app: only `githubTokenSet`. */
export interface BotTasksSettings {
  enabled: boolean;
  githubSync: boolean;
  pollMinutes: number;
  repos: string[];
  credential: "gh" | "token";
  requireEvidenceForDone: boolean;
  requireEvidenceForReview: boolean;
  allowOutboundComments: boolean;
  allowMerge: boolean;
}

export const BOT_TASKS_DEFAULTS: BotTasksSettings = {
  enabled: false,
  githubSync: false,
  pollMinutes: 5,
  repos: [],
  credential: "gh",
  requireEvidenceForDone: true,
  requireEvidenceForReview: false,
  allowOutboundComments: false,
  allowMerge: false,
};

export const BOT_TASKS_POLL_MINUTES = { min: 1, max: 1440 } as const;

export const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
