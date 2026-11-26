# Bot tasks: handoff (2026-11-26)

Work is paused on branch `feat/bot-tasks` in the fork Pdzly/OpenMausBot. No pull request is open yet. Nothing was pushed to
upstream (milind-soni/OpenMausBot). Argus has NOT reviewed this branch.

## Where things stand per spec point

| # | Spec point | State |
| --- | --- | --- |
| 1 | Local task store (id, title, status, owner, creator, timestamps, append-only log, GitHub ref) | Done. `server/bot-tasks/store.ts`, `service.ts`, `shared/bot-tasks.ts`. Atomic write, mode 0600, copy kept of an unreadable file. Verified in the dev app. |
| 2 | Bot tools in the agents tool server, for every bot when on | Done. `task_create`, `task_update`, `task_comment`, `task_link_github`, `task_list`, `task_get`, `task_post_github`. Exercised through the real `/api/internal/bot-tasks/*` routes with minted capabilities in the dev fixture. Not exercised through a real model turn (the fake engine does not issue MCP calls). |
| 3 | Evidence rule | Done. Refusal for no evidence and for a failing command verified in the dev app. Evidence is checked for shape, not truth (a commit is not looked up on GitHub). |
| 4 | One-way inbound GitHub sync (comments, reviews, checks, merge/close/reopen) | Done and verified read-only against linx-systems/clamui#370 (20 check entries, state merged) and against the fork PR (outside comment, close event, no duplicates on a second sync). Comments from before the link are deliberately not imported (documented). |
| 5 | Outbound only when explicitly triggered | Done and verified once: one comment on the throwaway fork PR through the UI route with the setting on. Refusals verified: setting off (403), bot tool without a person-started turn (403). Merge path is implemented and unit-tested but NOT run against GitHub. |
| 6 | Auto-link a ref | Done for `owner/repo#n` and github.com URLs in a task's title/text at creation (verified: `Tracks Pdzly/OpenMausBot#1`). Linking when a bot opens a PR through the tools relies on `task_link_github`; there is no hook on a PR-creating tool call. |
| 7 | UI: list, filters, detail with log and GitHub link | Done. Live reload on the `bot-task` frame verified. Screenshots in `~/autoclaudeprojects/bot-tasks-evidence/`. |
| 8 | Settings section and `app_settings` registry | Done. All nine settings; outbound, merge and credential are owner-only in the registry. Token lives in `config.json` (mode 0600), write-only. The brief's "vault" is mapped to this existing secret storage, not the Vault feature. |
| 9 | `docs/bot-tasks.md` and system prompt guidance (only when on) | Done. |

## Not done or not verified

- Argus review: not started. Findings, if any, are unfixed.
- No pull request opened.
- Merge on GitHub never executed against a real PR.
- No real model turn used the task tools; only direct calls to the internal routes.
- The "Post to GitHub" button and its confirmation dialog in the task view were not screenshotted (outbound was switched off again in the fixture before the shots).
- Full test suite not run to completion. The server side is too slow here (one third of it took over 90 minutes and was cut off).
- Tests not yet written: registry entries for `botTasks`, `BOT_TASKS_PROMPT` wording, config schema (`settings.ts`).
- Two server test failures in the focused run were not compared with `main`: `server/drivers/chat-mcp-browser-args.test.ts` (loopback hint) and `server/drivers/claude-keepwarm-box.test.ts`.
- The Settings page and the task view show only in advanced mode.

## Checks run (final head before the handoff commit: 2326fabae)

All from `~/autoclaudeprojects/OpenMausBot`, Node 24 (`PATH=/home/rooki/.nvm/versions/node/v24.22.2/bin:$PATH`).

| Command | Exit |
| --- | --- |
| `pnpm exec oxlint --deny-warnings .` | 0 |
| `pnpm typecheck` | 0 |
| `pnpm i18n:check` (also re-run after the language packs) | 0 |
| `pnpm exec tsc -p tsconfig.server.json --noEmit` | 0 |
| `pnpm exec vitest run src/locales` | 0 |
| `env -u MAX_MCP_OUTPUT_TOKENS pnpm exec vitest run server/index.test.ts` | 0 (349 tests) |
| `env -u MAX_MCP_OUTPUT_TOKENS pnpm exec vitest run server/drivers/claude.test.ts` | 0 (282 passed, 1 skipped) |
| `pnpm exec vitest run src shared packages` (before the language packs) | 1: 19 failed, 14766 passed. 14 were `settings-words` (missing language keys, fixed since); 5 fail identically on a clean `main` (`EnginesSettings.gemini.dom`, `PhoneDevicesSection.page`, `SidebarThreadRow`, `schedule-label`, `transcript-derivations`; locale/timezone dependent). |
| `pnpm exec vitest run server/bot-tasks server/routes server/app-settings server/config server/system-prompt server/drivers shared server/tool-groups server/agents` | 1: 2 failed, 9042 passed (the two listed above, not compared with `main`) |
| `pnpm exec vitest run server shared scripts --shard=1/3` | cut off by the shell limit after 90 minutes, no result. Seen failing before the cut: `outside-lineage.e2e` (21 of 23; identical on clean `main`), `cloud-lending-memory.e2e` (2, not compared with `main`). |

Environment notes: the shell exports `MAX_MCP_OUTPUT_TOKENS=10000`, which makes three tests in `claude.test.ts` fail until it is
unset. Do not run `pkill -f vite` or `pkill -f control-omb` from the same shell command; it kills the shell.

Not run: `pnpm test` as a whole, `pnpm broker:test`, electron and packaged-server tests, anything under `scripts/testing` as a full pass.

## Known bugs and risks

- The whole `bot-tasks.json` is rewritten on every change (fine up to the 2000-task cap).
- Evidence is shape-only: a made-up SHA passes.
- The log entry "posted to GitHub" shows the link but not the comment text.
- The `gh` credential source needs `gh` on the server's `PATH`; in an isolated fixture (changed `HOME`, minimal `PATH`) it fails with "GitHub token missing or invalid". The fixture used the saved-token source instead.
- DESIGN.md section 2 ("no new settings or confirm dialogs") was deliberately departed from, as requested.
- `src/components/EnginesSettings` and other files outside this feature were not touched.

## Decisions open for Philipp

1. Is the "vault" for the GitHub token meant to be the app's Vault feature rather than `config.json`? Today it is `config.json` (mode 0600).
2. Should comments from before a task was linked to a PR be imported (currently not)?
3. Should the Settings page and the task view also show outside advanced mode?
4. Keep evidence shape-only, or verify commits and CI runs against GitHub (extra API calls, needs read access)?
5. Open the PR against the fork's `main` as planned once Argus has reviewed?

## Next steps

1. Run the Argus review on `feat/bot-tasks` against `main` and fix the findings.
2. Compare the two unexplained server failures and `cloud-lending-memory.e2e` with a clean `main`; run the rest of `server/` in smaller chunks (one directory at a time).
3. Add the missing tests (registry entries, `BOT_TASKS_PROMPT`, config schema).
4. Re-run lint, typecheck, i18n check and the focused tests on the final head, then push and open the PR in Pdzly/OpenMausBot (base `main`, English text, no attribution lines).
5. Screenshot the "Post to GitHub" confirmation in a fresh isolated fixture and attach everything to the PR.

## How to resume

- Main working copy: `~/autoclaudeprojects/OpenMausBot`, branch `feat/bot-tasks`. Keep it.
- `~/autoclaudeprojects/OpenMausBot-gh` (branch `feat/bot-tasks-github`) and `~/autoclaudeprojects/OpenMausBot-ui` (branch `feat/bot-tasks-ui`) are Lin's and Pixel's working copies. Every commit in both is already in `feat/bot-tasks` (checked with `git cherry`), and both are clean. Both can be removed with `git worktree remove`.
- Dev fixture: started with `OMB_TEST_INTERNAL_CAPABILITY_KEY=<any string> node --experimental-strip-types scripts/control-omb.ts launch` and `OMB_PORT=<its port> pnpm exec vite --port 5198`. It makes its own data dir `/tmp/openmausbot-verify-data-XXXX`. The one used is deleted (it held a GitHub token); a new run creates a new one. Philipp's live data (`~/.openmausbot`) and `/opt/OpenMausBot` were never touched. Scripts that drove the internal routes are in `/tmp/drive` (may vanish).
- Evidence: `~/autoclaudeprojects/bot-tasks-evidence/` (settings, list, detail with evidence, detail with GitHub sync, live update, a copy of the fixture's task file) and `~/autoclaudeprojects/bot-tasks-shots/` (Pixel's preview shots).
- Branch `test/bot-tasks-sync-fixture` on origin and draft PR Pdzly/OpenMausBot#1 (closed, never merge): the throwaway target for the sync and outbound-comment tests. It holds three comments, one of them posted by the app.
- Issues are disabled on Pdzly/OpenMausBot, so outbound comment tests need a PR in the fork (open a new throwaway PR from that branch) or Philipp enabling issues.
- Allowed GitHub targets for tests: read-only against linx-systems (for example clamui#370); anything that writes only inside Pdzly/OpenMausBot.
