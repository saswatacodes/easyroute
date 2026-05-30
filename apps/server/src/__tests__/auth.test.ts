import { describe, it, expect, mock } from "bun:test";

let mockData: any = [];

mock.module("@node-rs/argon2", () => ({
  verify: mock(() => Promise.resolve(true)),
  hash: mock(() => Promise.resolve("hashed-password")),
}));

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
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

mock.module("@/lib/auth", () => ({
  createSession: mock(() => Promise.resolve("session-token")),
  invalidateSession: mock(() => Promise.resolve()),
  createPasswordResetToken: mock(() => Promise.resolve("reset-token")),
  validatePasswordResetToken: mock(() => Promise.resolve({ userId: "1" })),
  validateSessionToken: mock(() => Promise.resolve({ userId: "1" })),
  SESSION_EXPIRES_MS: 30 * 24 * 60 * 60 * 1000,
}));

const { default: app } = await import("@/index");

describe("POST /auth/login", () => {
  it("returns token and role on valid credentials", async () => {
    mockData = [{ id: 1, employeeId: "EMP001", passwordHash: "", role: "employee", pushToken: null }];

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: "EMP001", password: "password123" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.token).toBe("session-token");
  });

  it("returns 401 for unknown employee", async () => {
    mockData = [];

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: "UNKNOWN", password: "password123" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("succeeds", async () => {
    const res = await app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("POST /auth/forgot-password", () => {
  it("returns reset token for existing user", async () => {
    mockData = [{ id: 1 }];

    const res = await app.request("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: "EMP001" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resetToken).toBe("reset-token");
  });

  it("returns success even for unknown user (security)", async () => {
    mockData = [];

    const res = await app.request("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: "UNKNOWN" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).resetToken).toBeUndefined();
  });
});

describe("POST /auth/reset-password", () => {
  it("resets password with valid token", async () => {
    const res = await app.request("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", password: "newpassword123" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 with invalid token", async () => {
    const { validatePasswordResetToken } = await import("@/lib/auth");
    validatePasswordResetToken.mockImplementationOnce(() => Promise.resolve(null));

    const res = await app.request("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token", password: "newpassword123" }),
    });

    expect(res.status).toBe(400);
  });
});
