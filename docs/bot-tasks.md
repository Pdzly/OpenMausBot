# Bot tasks

A task list for your bots. A bot opens a task, moves it through its states, writes notes on it and, when the work is
finished, shows proof instead of saying so. The tasks live in the app. GitHub is read, never written to, unless you ask.

Off by default. Turn it on in Settings → Bot tasks. While it is off, bots get no task tools, the system prompt carries no
task guidance, the task routes answer 404 and nothing polls GitHub.

## What a task is

| Field | Meaning |
| --- | --- |
| `id`, `title` | Short id (`tsk_...`) and a title of up to 160 characters. |
| `status` | `open`, `in_progress`, `blocked`, `review`, `done`, `cancelled`. |
| owner | The bot that works on it. Anyone can read a task; only its owner, its creator or you change it. |
| creator, timestamps | Who opened it and when it last changed. |
| GitHub ref | Optional `owner/repo#number`, a pull request or an issue. |
| activity | An append-only log: notes, status changes with their evidence, owner changes, GitHub events, posts and sync problems. |

The store is `bot-tasks.json` in the data folder (mode 0600, written atomically). Each task keeps up to 400 log entries
in timestamp order. At the limit, the oldest GitHub and sync-error entries go first, then the oldest local notes. If
local structural entries alone fill the log, the oldest of those are dropped while the creation and current link stay.
The list holds up to 2000 tasks. A file that cannot be read starts an empty list rather than failing the app, and a copy (`bot-tasks.json.bad-<time>`) is kept before the next write replaces it; the same goes for records that do not parse.

## Bot tools

Every bot gets these while the feature is on. They are core tools (never deferred) and appear in chats and rooms.

| Tool | Does |
| --- | --- |
| `task_create` | Opens a task: `title`, `text?`, `github?`, `owner?` (a bot name or id; default is the caller). |
| `task_update` | Moves a task (`status`, with `evidence?` and `comment?`) and/or hands it to another bot (`owner`). |
| `task_comment` | Adds a note. The note stays in the app. |
| `task_link_github` | Attaches `owner/repo#n` or a pull request / issue URL. |
| `task_list` | Lists tasks, filtered by `status`, `mine`, `repo`, `query`. |
| `task_get` | Reads one task and its log. With `sync: true` it first pulls what is new from GitHub. |
| `task_post_github` | The only outbound call. See below. |

The calling bot comes from the turn's capability, never from the arguments.

### Evidence

By default, moving a task to `done` needs at least one qualifying item. Turn on "Require evidence for review" to apply
the same rule to `review`. The server checks evidence supplied for `done` and for gated `review` moves.

| `kind` | Fields | Notes |
| --- | --- | --- |
| `commit` | `sha` (7 to 40 hex), `repo?` | GitHub confirms existence in the linked repository, or in the named allowed repository if the task is unlinked. This check establishes repository membership only. |
| `ci_run` | `url` | A GitHub Actions run or job in the linked repository. Success counts as proof. A finished run or job with any other conclusion fails. A run or job still going is unverifiable. |
| `review_url` | `url` | An anchored review, inline PR comment or issue comment on the linked GitHub item. |
| `command` | `command`, `exitCode` | The server records the exit code as unverifiable. Exit code 0 counts as proof. |

Every failed check blocks the move and reports what went wrong. Missing credentials, an unreachable API and GitHub
claims outside the repository allowlist are unverifiable and cannot satisfy the evidence requirement. A GitHub 404
is treated as missing, including when GitHub masks a private resource with a 404. A move accepts up to 10 items and makes
at most one short, read-only GitHub request per item. On success the task and its status entry carry the evidence and the
server's verification status, timestamp and detail. Cancelling, blocking and reopening need no evidence.

## GitHub sync (inbound)

When GitHub sync is on, linking a task starts a backfill. The first successful sync also backfills existing links and
records GitHub timestamps. The app then polls every "Poll interval" minutes (default 5, 1 to 1440). You can also sync on
demand using "Sync now" in the task or `task_get` with `sync: true`. The log includes the following.

- comments from other people,
- reviews with their state,
- CI and check results,
- merged, closed and reopened events.

Events older than the link carry `imported: true` and sort by their original GitHub timestamp. At most five GitHub pages
are read per endpoint, prioritizing recent pages when GitHub provides a last-page link. The first sync fetches checks
on the PR head and up to three earlier PR commits returned by GitHub. Polls deduplicate events by key. The app recognizes
its own posted comments by their hidden marker and skips them.
Only repositories on the allowlist are synced; an empty allowlist syncs none. A failing sync adds one `sync_error` line
(not one per poll) and the next poll tries again.

A title, note or status update that names exactly one GitHub item can link it automatically if the task has no link yet.
When the text names several items, use `task_link_github` to choose one.

### Credential

Settings → Bot tasks → GitHub credential:

- **gh CLI** (default): the app runs `gh auth token` and keeps the answer for a minute. Nothing is stored. `gh` must be on the server's `PATH` and signed in as the user the server runs as; otherwise a sync records "GitHub token missing or invalid" and the token option is the way out.
- **Vault token** (`credential: "vault"`). A personal access token sealed in a dedicated server vault slot. Settings
  exposes only `githubTokenSet`. The slot is separate from GitHub sign-in and from secrets shared with bots.
  On upgrade, the vault write must succeed before the server clears the legacy token from `config.json`. Older config
  backups may still contain their original plaintext tokens.

Inbound sync needs read access to the repositories (a fine-grained token with Pull requests, Issues and Checks read,
or `gh` signed in with repository access). Evidence verification also needs Contents read for commits and Actions read
for runs and jobs. Posting a comment needs write access to that repository's issues or pull requests.

## Outbound to GitHub (only when you ask)

Two settings, both off by default:

- **Allow comments on GitHub**: lets the app post one comment to a task's pull request or issue.
- **Allow merging**: additionally lets a comment be sent together with a merge.

A post happens in exactly two cases, and each is one comment:

1. You press "Post to GitHub" in the task (optionally "and merge").
2. A bot calls `task_post_github` in a turn that began with your own message ("post this to GitHub", "merge and comment
   on the PR"). A routine, a wake-up or another bot cannot start that turn, and the call is refused there.

Both paths check the settings and the repository allowlist. A merge needs the pull request to be open and mergeable,
runs only when requested, and is never done by default. Syncing never posts, and nothing posts automatically when a task
is marked done. The comment ends with a hidden marker so the next sync does not read it back as someone else's.

The switches for outbound comments, merging and the credential are visible to bots through `app_settings` but only you can
change them; a bot with full access cannot widen its own GitHub powers. The rest of the section (on/off, sync, poll
interval, repositories, the two evidence rules) can be changed through `app_settings` as well.

## Settings

| Setting | Default |
| --- | --- |
| Enable bot tasks | off |
| Sync GitHub | off |
| Poll interval (minutes) | 5 |
| Repositories to sync (`owner/repo`) | none |
| GitHub credential | gh CLI |
| Require evidence for done | on |
| Require evidence for review | off |
| Allow comments on GitHub | off |
| Allow merging | off |

They are the `botTasks` section of `config.json`:

```json
{ "botTasks": { "enabled": true, "githubSync": true, "pollMinutes": 5, "repos": ["owner/repo"], "credential": "gh",
  "requireEvidenceForDone": true, "requireEvidenceForReview": false, "allowOutboundComments": false, "allowMerge": false } }
```

## The task view

Bot tasks in the sidebar opens the list: filter by status, bot and repository, search the titles. A task opens with its
state, owner, GitHub link and the log, with evidence next to the status change it backs. The log updates when a bot or a
sync adds to it.

## System prompt

When the feature is on, bots are told to open a task for work that takes more than a moment, keep its status true, give
evidence rather than a statement when they finish, keep notes in the app, link a pull request they open, and use
`task_post_github` only when you asked. When it is off, the prompt is unchanged.

## HTTP

| Route | |
| --- | --- |
| `GET /api/bot-tasks` | `{ enabled, tasks }`, with `?status=&bot=&repo=&q=`. |
| `GET /api/bot-tasks/:id` | One task with its log and its owner's name. |
| `PATCH /api/bot-tasks/:id` | `{ status, evidence?, comment? }` verifies the move and returns `{ ok: true, task }`. |
| `POST /api/bot-tasks/:id/sync` | Sync now, even when polling is off. |
| `POST /api/bot-tasks/:id/post` | `{ text, merge? }`: your own post, subject to the two switches. |

The config read model returns `botTasks.credential` (`"gh"` or `"vault"`) and `botTasks.githubTokenSet`.
Send `{ botTasks: { githubToken: "…" } }` to `PATCH /api/config` to set the token, or use `null` to clear it.

Full task responses expose status evidence in `task.evidence` and in the corresponding status entry in `task.activity`.
Checked claims include `verification: { status, checkedAt, detail? }`, where `checkedAt` is a Unix time in milliseconds.
Backfilled entries carry `imported: true` and use the original GitHub time in `at`.

Bots reach the same service through the agents tool server (`/api/internal/bot-tasks/*`), which needs a turn capability.

## Limits

- One-way: GitHub changes reach the log; edits in the log never reach GitHub.
- GitHub rate limits apply. The poll backs off by recording one error and trying at the next interval.
- The file is rewritten on every change, which is fine for the 2000-task cap but not for a team-wide ledger.
