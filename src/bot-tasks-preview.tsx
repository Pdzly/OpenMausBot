// Dev-only: the Bot tasks settings page and task view against made-up answers, served at /bot-tasks-preview.html; not in
// the packaged app. Every request is answered here, so it needs no server.
// ?view=settings|list|detail|empty|off&skin=midnight|daylight&lang=de
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "list";
const NOW = Date.now(), MIN = 60_000, HOUR = 60 * MIN;
const lin = { kind: "bot", id: "lin", name: "Lin" }, rigel = { kind: "bot", id: "rigel", name: "Rigel" }, pixel = { kind: "bot", id: "pixel", name: "Pixel" };
const octo = { kind: "github", login: "octocat" };

const botTasks = {
  enabled: view !== "off", githubSync: true, pollMinutes: 5, repos: ["linx-systems/clamui", "linx-systems/pi-sentinel", "linx-systems/journalreader"],
  credential: "token", requireEvidenceForDone: true, requireEvidenceForReview: false, allowOutboundComments: true, allowMerge: true, githubTokenSet: true,
};
const summary = (task: Record<string, unknown>, ownerName: string, activityCount: number) => ({ ...task, ownerName, activityCount });
const TASKS = view === "empty" ? [] : [
  summary({ id: "t-101", title: "Show scan progress in the tray menu", status: "review", ownerBotId: "pixel", createdBy: lin, createdAt: NOW - 26 * HOUR, updatedAt: NOW - 8 * MIN,
    github: { repo: "linx-systems/clamui", number: 214, kind: "pull" }, githubState: { state: "open", syncedAt: NOW - 3 * MIN } }, "Pixel", 9),
  summary({ id: "t-98", title: "Retry Pi-hole API calls after a 429 instead of failing the check", status: "in_progress", ownerBotId: "lin", createdBy: rigel, createdAt: NOW - 2 * 24 * HOUR,
    updatedAt: NOW - 40 * MIN, github: { repo: "linx-systems/pi-sentinel", number: 57, kind: "issue" } }, "Lin", 4),
  summary({ id: "t-97", title: "Release 0.9.2 notes and changelog", status: "blocked", ownerBotId: "rigel", createdBy: pixel, createdAt: NOW - 3 * 24 * HOUR, updatedAt: NOW - 3 * HOUR }, "Rigel", 3),
  summary({ id: "t-95", title: "Parse multi-line journal entries without dropping the timestamp", status: "done", ownerBotId: "lin", createdBy: lin, createdAt: NOW - 5 * 24 * HOUR,
    updatedAt: NOW - 26 * HOUR, github: { repo: "linx-systems/journalreader", number: 31, kind: "pull" }, githubState: { state: "merged", syncedAt: NOW - 26 * HOUR } }, "Lin", 7),
  summary({ id: "t-90", title: "Try a second icon set for dark panels", status: "cancelled", ownerBotId: "pixel", createdBy: pixel, createdAt: NOW - 9 * 24 * HOUR, updatedAt: NOW - 6 * 24 * HOUR }, "Pixel", 2),
];
const DETAIL = {
  ...TASKS[0], activity: [
    { id: "a1", at: NOW - 26 * HOUR, by: lin, type: "created" },
    { id: "a2", at: NOW - 25 * HOUR, by: lin, type: "owner", to: "pixel" },
    { id: "a3", at: NOW - 24 * HOUR, by: pixel, type: "status", from: "open", to: "in_progress" },
    { id: "a4", at: NOW - 5 * HOUR, by: pixel, type: "github_ref", ref: { repo: "linx-systems/clamui", number: 214, kind: "pull" } },
    { id: "a5", at: NOW - 4 * HOUR, by: { kind: "system" }, type: "github_check", name: "build", conclusion: "success", url: "https://github.com/linx-systems/clamui/actions/runs/912" },
    { id: "a6", at: NOW - 3 * HOUR, by: octo, type: "github_comment", text: "Looks good. Can the bar hide when no scan runs?\n\n<b>not bold</b>", url: "https://github.com/linx-systems/clamui/pull/214#issuecomment-1" },
    { id: "a7", at: NOW - 2 * HOUR, by: pixel, type: "comment", text: "Done: the bar hides between scans." },
    { id: "a8", at: NOW - 8 * MIN, by: pixel, type: "status", from: "in_progress", to: "review", evidence: [
      { kind: "commit", sha: "9f3c2a1e7b6d5c4f3a2b1c0d9e8f7a6b5c4d3e2f" },
      { kind: "ci_run", url: "https://github.com/linx-systems/clamui/actions/runs/918" },
      { kind: "command", command: "pnpm test --run tray", exitCode: 0 },
      { kind: "command", command: "pnpm lint", exitCode: 1 },
    ] },
  ],
};

const CONFIG = {
  composio: { configured: false }, box: { configured: false }, vps: { configured: false, sshAlias: "" },
  rooms: { turnTimeoutMinutes: 10 }, localVm: { mode: "shared", maxInstances: 1 },
  profile: { name: "Maya Shah", email: "maya@example.com" }, features: { savedSteps: false },
  onboarding: { completedAt: "2026-01-01", version: 1, reelSeen: true, hintsSeen: [] },
  edition: { edition: "community", features: [] }, browserProfiles: [], managedPolicy: null,
  signIn: { admins: [], members: [] }, membership: { authority: "local", pairingCodes: true }, botTasks,
};
const ANSWERS: Record<string, unknown> = {
  "/api/instances": { instances: [] }, "/api/config": CONFIG,
  "/api/auth/session": { kind: "session", id: "s1", label: "Chrome", email: "maya@example.com", scopes: ["admin", "client"], expiresAt: 0 },
  "/api/auth/sessions": { sessions: [{ id: "s1" }], current: "s1" }, "/api/routines": { routines: [], runs: [] }, "/api/webhooks": { webhooks: [], attempts: [] },
  "/api/bots": { bots: [{ id: "lin", name: "Lin", threadId: "t-lin" }, { id: "rigel", name: "Rigel", threadId: "t-rigel" }, { id: "pixel", name: "Pixel", threadId: "t-pixel" }], groups: [] },
  "/api/bot-tasks": { enabled: botTasks.enabled, tasks: TASKS },
  "/api/bot-tasks/t-101": { task: DETAIL, ownerName: "Pixel" },
};
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  return Promise.resolve(new Response(JSON.stringify(ANSWERS[url.pathname] ?? {}), { headers: { "content-type": "application/json" } }));
};
class QuietEventSource {
  onopen: (() => void) | null = null; onerror: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 1;
  constructor(readonly url: string) { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ kind: "hello", resumed: false, cursor: "run:0" }) }), 50); }
  addEventListener() {} removeEventListener() {} close() {}
}
Object.assign(window, { EventSource: QuietEventSource });
try { localStorage.setItem("omb-advanced-mode", "1"); } catch { /* blocked storage */ }

const [{ StoreProvider }, { useStoreDispatch, useStoreSelector }, { SettingsModal }, { BotTasksPage }, { applySkin, readSkin, SKIN_IDS }, { loadLocale }] = await Promise.all([
  import("@/state/store"), import("@/state/store-select"), import("@/components/SettingsModal"), import("@/components/bot-tasks/BotTasksPage"), import("@/lib/skins"), import("@/lib/i18n"),
]);

function SettingsView() {
  const loaded = useStoreSelector((app) => app.config !== null), open = useStoreSelector((app) => app.appSettingsOpen), dispatch = useStoreDispatch();
  useEffect(() => { if (loaded) dispatch({ type: "toggleAppSettings", open: true, section: "bot-tasks" }); }, [loaded, dispatch]);
  return open ? <SettingsModal /> : null;
}

function TasksView() {
  const loaded = useStoreSelector((app) => app.config !== null);
  useEffect(() => {
    if (view !== "detail") return;
    const timer = setInterval(() => {
      const row = document.querySelector<HTMLButtonElement>('[data-bot-task-row="t-101"] button');
      if (row) { row.click(); clearInterval(timer); }
    }, 50);
    return () => clearInterval(timer);
  }, []);
  return loaded ? <div className="flex h-screen bg-app text-ink"><BotTasksPage /></div> : null;
}

const asked = params.get("skin");
applySkin((SKIN_IDS as readonly string[]).includes(asked ?? "") ? asked as Parameters<typeof applySkin>[0] : readSkin());
await loadLocale(params.get("lang") ?? "en");
createRoot(document.getElementById("root")!).render(<StrictMode><StoreProvider>{view === "settings" ? <SettingsView /> : <TasksView />}</StoreProvider></StrictMode>);
