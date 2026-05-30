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
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
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

describe("GET /users/me", () => {
  it("returns employee profile", async () => {
    // First query: user lookup, second: role lookup (by session middleware, returns mockData),
    // third: employee lookup
    mockData = [{ id: 1, employeeId: "EMP001", role: "employee", pushToken: null }];
    // The role query from session middleware will use mockData too - set it to the user first
    // then override for the employee query

    const res = await app.request("/users/me", { headers: authHeaders() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe("employee");
    expect(body.id).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/users/me");

    expect(res.status).toBe(401);
  });
});

describe("PATCH /users/me", () => {
  it("updates push_token", async () => {
    mockData = [{ id: 1, employeeId: "EMP001", role: "employee", pushToken: null }];

    const res = await app.request("/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ push_token: "fcm-token" }),
    });

    expect(res.status).toBe(200);
  });

  it("rejects invalid fields", async () => {
    mockData = [{ id: 1, employeeId: "EMP001", role: "employee", pushToken: null }];

    const res = await app.request("/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });
});
