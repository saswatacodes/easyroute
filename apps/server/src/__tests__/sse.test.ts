import { describe, it, expect, mock } from "bun:test";

let mockData: any = [];

mock.module("@/db", () => ({
  db: {
    select: (...args: any[]) => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(mockData),
        then: (resolve: any) => resolve(mockData),
      };
      return chain;
    },
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve(mockData) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

mock.module("@/lib/auth", () => ({
  validateSessionToken: mock(() => Promise.resolve({ userId: "1" })),
  createSession: mock(() => Promise.resolve("session-token")),
  invalidateSession: mock(() => Promise.resolve()),
  createPasswordResetToken: mock(() => Promise.resolve("reset-token")),
  validatePasswordResetToken: mock(() => Promise.resolve({ userId: "1" })),
  SESSION_EXPIRES_MS: 30 * 24 * 60 * 60 * 1000,
}));

const { default: app } = await import("@/index");

function authHeaders() {
  return { Cookie: "session_token=valid-token" };
}

describe("GET /sse/trips/:id/stream", () => {
  it("requires auth", async () => {
    const res = await app.request("/sse/trips/1/stream");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent trip", async () => {
    mockData = [];
    const res = await app.request("/sse/trips/999/stream", { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid trip id", async () => {
    const res = await app.request("/sse/trips/abc/stream", { headers: authHeaders() });
    expect(res.status).toBe(400);
  });
});

describe("GET /sse/drivers/trips/stream", () => {
  it("requires auth", async () => {
    const res = await app.request("/sse/drivers/trips/stream");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-driver role", async () => {
    mockData = [];
    const res = await app.request("/sse/drivers/trips/stream", { headers: authHeaders() });
    expect(res.status).toBe(403);
  });
});
