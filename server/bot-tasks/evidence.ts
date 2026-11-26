import type { BotTaskEvidence, BotTaskGithubRef } from "../../shared/bot-tasks.ts";
import { REPO_PATTERN } from "../../shared/bot-tasks.ts";

export class BotTaskError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const EVIDENCE_EXAMPLE = 'Example: evidence [{"kind":"commit","sha":"<40-hex>"}, {"kind":"ci_run","url":"https://github.com/o/r/actions/runs/123"}, {"kind":"review_url","url":"https://github.com/o/r/pull/7#pullrequestreview-1"}, {"kind":"command","command":"pnpm test","exitCode":0}].';

const SHA = /^[0-9a-f]{7,40}$/i;

function httpsUrl(raw: unknown, what: string): URL {
  if (typeof raw !== "string") throw new BotTaskError(400, `${what} needs a url. ${EVIDENCE_EXAMPLE}`);
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new BotTaskError(400, `${what}: "${raw.slice(0, 80)}" is not a URL.`); }
  if (url.protocol !== "https:" || url.username || url.password) throw new BotTaskError(400, `${what} must be a plain https URL.`);
  return url;
}

/** Checks one evidence item's shape. It proves that a claim names something checkable, not that the thing exists. */
export function parseEvidence(raw: unknown): BotTaskEvidence {
  if (!raw || typeof raw !== "object") throw new BotTaskError(400, `Each evidence item is an object. ${EVIDENCE_EXAMPLE}`);
  const item = raw as Record<string, unknown>;
  switch (item.kind) {
    case "commit": {
      if (typeof item.sha !== "string" || !SHA.test(item.sha.trim())) throw new BotTaskError(400, `A commit needs a hex sha of 7 to 40 characters. ${EVIDENCE_EXAMPLE}`);
      const repo = typeof item.repo === "string" && item.repo.trim() ? item.repo.trim() : undefined;
      if (repo && !REPO_PATTERN.test(repo)) throw new BotTaskError(400, "A commit's repo is owner/repo.");
      return { kind: "commit", sha: item.sha.trim().toLowerCase(), ...(repo ? { repo } : {}) };
    }
    case "ci_run": {
      const url = httpsUrl(item.url, "A CI run");
      return { kind: "ci_run", url: url.toString() };
    }
    case "review_url": {
      const url = httpsUrl(item.url, "A review or comment link");
      if (url.hostname !== "github.com" || !/^\/[^/]+\/[^/]+\/(?:pull|issues)\/\d+/.test(url.pathname)) throw new BotTaskError(400, "A review or comment link points at a GitHub pull request or issue, https://github.com/<owner>/<repo>/pull/<n>#…");
      return { kind: "review_url", url: url.toString() };
    }
    case "command": {
      const command = typeof item.command === "string" ? item.command.trim() : "";
      if (!command || command.length > 500) throw new BotTaskError(400, `A command item names the command that ran (up to 500 characters). ${EVIDENCE_EXAMPLE}`);
      if (typeof item.exitCode !== "number" || !Number.isInteger(item.exitCode)) throw new BotTaskError(400, `A command item needs the integer exitCode it returned. ${EVIDENCE_EXAMPLE}`);
      return { kind: "command", command, exitCode: item.exitCode };
    }
    default:
      throw new BotTaskError(400, `Evidence kind must be commit, ci_run, review_url or command. ${EVIDENCE_EXAMPLE}`);
  }
}

/** A command that failed does not show the work is done. */
export function supportsDone(items: readonly BotTaskEvidence[]): boolean {
  return items.some((item) => item.kind !== "command" || item.exitCode === 0);
}

const REF_TEXT = /(?<![\w/.-])([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#(\d{1,7})\b/g;
const REF_URL = /https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})\/(pull|issues)\/(\d{1,7})\b/g;

/** Every distinct GitHub pull request or issue a text names, as owner/repo#n or as a github.com link. */
export function githubRefsIn(text: string): BotTaskGithubRef[] {
  const found = new Map<string, BotTaskGithubRef>();
  for (const match of text.matchAll(REF_URL)) found.set(`${match[1]!.toLowerCase()}#${match[3]}`, { repo: match[1]!, number: Number(match[3]), kind: match[2] === "pull" ? "pull" : "issue" });
  for (const match of text.matchAll(REF_TEXT)) if (!found.has(`${match[1]!.toLowerCase()}#${match[2]}`)) found.set(`${match[1]!.toLowerCase()}#${match[2]}`, { repo: match[1]!, number: Number(match[2]) });
  return [...found.values()];
}

export function parseRef(raw: unknown): BotTaskGithubRef {
  if (typeof raw !== "string") throw new BotTaskError(400, "A GitHub reference is owner/repo#number or a github.com pull request or issue link.");
  const refs = githubRefsIn(raw.trim());
  if (refs.length !== 1) throw new BotTaskError(400, "A GitHub reference is owner/repo#number or a github.com pull request or issue link.");
  return refs[0]!;
}

export const refLabel = (ref: BotTaskGithubRef) => `${ref.repo}#${ref.number}`;
