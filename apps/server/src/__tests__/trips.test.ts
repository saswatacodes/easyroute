import { describe, it, expect, mock } from "bun:test";

mock.module("@/lib/auth", () => ({
  validateSessionToken: mock(() => Promise.resolve({ userId: "1" })),
  createSession: mock(() => Promise.resolve("session-token")),
  invalidateSession: mock(() => Promise.resolve()),
  createPasswordResetToken: mock(() => Promise.resolve("reset-token")),
  validatePasswordResetToken: mock(() => Promise.resolve({ userId: "1" })),
  SESSION_EXPIRES_MS: 30 * 24 * 60 * 60 * 1000,
}));

const mockListTrips = mock(() => Promise.resolve({ items: [], nextCursor: undefined }));
const mockGetTripDetail = mock(() => Promise.resolve({}));
const mockCancelTrip = mock(() => Promise.resolve({ id: 1, status: "cancelled" }));
const mockRateTrip = mock(() => Promise.resolve({ id: 1, score: 5 }));

mock.module("@/services/trips.service", () => ({
  listTrips: mockListTrips,
  getTripDetail: mockGetTripDetail,
  cancelTrip: mockCancelTrip,
  rateTrip: mockRateTrip,
}));

const { default: app } = await import("@/index");

function authHeaders() {
  return { Cookie: "session_token=valid-token" };
}

describe("GET /trips", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/trips");
    expect(res.status).toBe(401);
  });

  it("lists trips for authenticated user", async () => {
    mockListTrips.mockImplementation(() =>
      Promise.resolve({ items: [{ id: 1, status: "scheduled" }], nextCursor: undefined }),
    );

    const res = await app.request("/trips", { headers: authHeaders() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(1);
  });
});

describe("GET /trips/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/trips/1");
    expect(res.status).toBe(401);
  });

  it("returns trip detail", async () => {
    mockGetTripDetail.mockImplementation(() =>
      Promise.resolve({ id: 1, status: "scheduled", passengers: [{ employeeId: 1 }] }),
    );

    const res = await app.request("/trips/1", { headers: authHeaders() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(1);
    expect(body.passengers).toHaveLength(1);
  });
});

describe("POST /trips/:id/cancel", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/trips/1/cancel", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("cancels a scheduled trip", async () => {
    const res = await app.request("/trips/1/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason: "Sick leave" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("cancelled");
  });
});

describe("POST /trips/:id/rate", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/trips/1/rate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid score", async () => {
    const res = await app.request("/trips/1/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ score: 6 }),
    });

    expect(res.status).toBe(400);
  });

  it("rates a trip", async () => {
    const res = await app.request("/trips/1/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ score: 5, comment: "Great ride" }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.score).toBe(5);
  });
});
