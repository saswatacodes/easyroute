import { describe, it, expect, mock } from "bun:test";

let mockData: any = [];

mock.module("@/db", () => ({
  db: {
    select: (...args: any[]) => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: (n: number) => {
          if (n === mockData.length + 1) return Promise.resolve(mockData);
          return Promise.resolve(mockData.slice(0, n));
        },
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

describe("GET /notifications", () => {
  it("returns notification list with pagination", async () => {
    mockData = [
      { id: 2, userId: 1, title: "Trip assigned", body: "Driver Bob assigned", isRead: false, createdAt: new Date("2026-05-29T10:00:00Z"), deletedAt: null },
      { id: 1, userId: 1, title: "Welcome", body: "Welcome to EasyRoute", isRead: true, createdAt: new Date("2026-05-28T10:00:00Z"), deletedAt: null },
    ];
    const res = await app.request("/notifications", { headers: authHeaders() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].title).toBe("Trip assigned");
    expect(body.items[0].isRead).toBe(false);
    expect(body.items[0].createdAt).toBeString();
  });

  it("requires auth", async () => {
    const res = await app.request("/notifications");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /notifications/read-all", () => {
  it("marks all as read", async () => {
    mockData = [];
    const res = await app.request("/notifications/read-all", { method: "PATCH", headers: authHeaders() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("requires auth", async () => {
    const res = await app.request("/notifications/read-all", { method: "PATCH" });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /notifications/:id/read", () => {
  it("marks single notification as read", async () => {
    mockData = [{ id: 5, userId: 1, title: "Test", body: "Body", isRead: false, createdAt: new Date(), deletedAt: null }];
    const res = await app.request("/notifications/5/read", { method: "PATCH", headers: authHeaders() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(5);
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/notifications/abc/read", { method: "PATCH", headers: authHeaders() });
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const res = await app.request("/notifications/1/read", { method: "PATCH" });
    expect(res.status).toBe(401);
  });
});
