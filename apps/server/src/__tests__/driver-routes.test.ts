import { describe, it, expect, mock } from "bun:test";

// Minimal mock: only handles session middleware's role query
const roleChain = {
  from: () => roleChain,
  where: () => roleChain,
  limit: () => Promise.resolve([{ role: "driver" }]),
  then: (onFulfilled: any) => Promise.resolve([{ role: "driver" }]).then(onFulfilled),
};

mock.module("@/db", () => ({
  db: {
    select: () => roleChain,
  },
}));

mock.module("@/lib/auth", () => ({
  validateSessionToken: mock(() => Promise.resolve({ userId: "2" })),
  createSession: mock(() => Promise.resolve("session-token")),
  invalidateSession: mock(() => Promise.resolve()),
  createPasswordResetToken: mock(() => Promise.resolve("reset-token")),
  validatePasswordResetToken: mock(() => Promise.resolve({ userId: "2" })),
  SESSION_EXPIRES_MS: 30 * 24 * 60 * 60 * 1000,
}));

const mockGetDriverTrips = mock(() =>
  Promise.resolve({ items: [{ id: 1, routeId: 1, status: "scheduled", scheduledDate: "2026-06-01", passengerCount: 3, boardedCount: 0, droppedCount: 0 }], nextCursor: undefined }),
);
const mockGetDriverTripDetail = mock(() =>
  Promise.resolve({ id: 1, routeId: 1, status: "scheduled", passengers: [] }),
);
const mockUpdateTripStatus = mock(() =>
  Promise.resolve({ id: 1, status: "en_route" }),
);
const mockBoardPassenger = mock(() =>
  Promise.resolve({ boardedAt: "2026-06-01T10:00:00Z" }),
);
const mockDropPassenger = mock(() =>
  Promise.resolve({ droppedAt: "2026-06-01T11:00:00Z" }),
);

mock.module("@/services/driver.service", () => ({
  getDriverTrips: mockGetDriverTrips,
  getDriverTripDetail: mockGetDriverTripDetail,
  updateTripStatus: mockUpdateTripStatus,
  boardPassenger: mockBoardPassenger,
  dropPassenger: mockDropPassenger,
}));

const { default: app } = await import("@/index");

function authHeaders() {
  return { Cookie: "session_token=valid-token" };
}

describe("GET /driver/trips", () => {
  it("returns driver trips", async () => {
    const res = await app.request("/driver/trips", { headers: authHeaders() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/driver/trips");
    expect(res.status).toBe(401);
  });
});

describe("GET /driver/trips/:id", () => {
  it("returns trip detail", async () => {
    const res = await app.request("/driver/trips/1", { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(1);
  });
});

describe("PATCH /driver/trips/:id/status", () => {
  it("updates trip status", async () => {
    const res = await app.request("/driver/trips/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: "en_route" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("en_route");
  });

  it("returns 400 for invalid status", async () => {
    const res = await app.request("/driver/trips/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: "invalid_status" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /driver/trips/:id/passengers/:eid/board", () => {
  it("boards a passenger", async () => {
    const res = await app.request("/driver/trips/1/passengers/1/board", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect((await res.json())).toHaveProperty("boardedAt");
  });

  it("returns 400 for invalid employee id", async () => {
    const res = await app.request("/driver/trips/abc/passengers/xyz/board", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /driver/trips/:id/passengers/:eid/drop", () => {
  it("drops a passenger", async () => {
    const res = await app.request("/driver/trips/1/passengers/1/drop", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect((await res.json())).toHaveProperty("droppedAt");
  });
});
