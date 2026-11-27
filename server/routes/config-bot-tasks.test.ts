import { describe, expect, it, vi } from "vitest";

import type { RequestAuth } from "../request-auth.ts";
import { createConfigRoutes, type ConfigRouteDeps } from "./config.ts";

const cloudAdmin: RequestAuth = {
  kind: "session",
  session: { id: "admin", scopes: ["admin", "client"], teamRole: "admin" } as never,
  via: "bearer",
  scopes: ["admin", "client"],
};

describe("bot task GitHub access", () => {
  it.each([
    { auth: { kind: "loopback", trust: "service", scopes: [] }, cloudTeam: false },
    { auth: cloudAdmin, cloudTeam: true },
  ])("rejects unauthorized token updates before reaching the vault", async ({ auth, cloudTeam }) => {
    const setBotTasksGithubToken = vi.fn();
    const route = createConfigRoutes({ cloudTeam, botTasksVault: { setBotTasksGithubToken } } as unknown as ConfigRouteDeps);
    const json = vi.fn();
    await route({
      req: {}, res: {}, url: new URL("http://host/api/config"), path: "/api/config", method: "PATCH", auth,
      json, readBody: async () => ({ botTasks: { githubToken: "fixture-token" } }),
    } as unknown as Parameters<typeof route>[0]);

    expect(json).toHaveBeenCalledWith(expect.anything(), 403, { error: "Only the owner can change GitHub access for bot tasks." });
    expect(setBotTasksGithubToken).not.toHaveBeenCalled();
  });
});
