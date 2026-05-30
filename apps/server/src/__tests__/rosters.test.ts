import { describe, it, expect, mock } from "bun:test";

mock.module("@/lib/auth", () => ({
  validateSessionToken: mock(() => Promise.resolve({ userId: "1" })),
  createSession: mock(() => Promise.resolve("session-token")),
  invalidateSession: mock(() => Promise.resolve()),
  createPasswordResetToken: mock(() => Promise.resolve("reset-token")),
  validatePasswordResetToken: mock(() => Promise.resolve({ userId: "1" })),
  SESSION_EXPIRES_MS: 30 * 24 * 60 * 60 * 1000,
}));

const mockGetEmployeeBookings = mock(() => Promise.resolve([]));
const mockCreateBooking = mock(() => Promise.resolve({ id: 1 }));
const mockCancelBooking = mock(() => Promise.resolve({ id: 1, status: "cancelled" }));

mock.module("@/services/roster.service", () => ({
  getEmployeeBookings: mockGetEmployeeBookings,
  createBooking: mockCreateBooking,
  cancelBooking: mockCancelBooking,
}));

const { default: app } = await import("@/index");

function authHeaders() {
  return { Cookie: "session_token=valid-token" };
}

describe("GET /roster-bookings", () => {
  it("returns employee's bookings", async () => {
    mockGetEmployeeBookings.mockImplementation(() =>
      Promise.resolve([{ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01", status: "scheduled" }]),
    );

    const res = await app.request("/roster-bookings", { headers: authHeaders() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/roster-bookings");
    expect(res.status).toBe(401);
  });
});

describe("POST /roster-bookings", () => {
  it("creates a booking", async () => {
    mockCreateBooking.mockImplementation(() =>
      Promise.resolve({ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01", status: "scheduled" }),
    );

    const res = await app.request("/roster-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pickupStopId: 10, dropoffStopId: 20, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01" }),
    });

    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(1);
  });

  it("returns 400 for invalid daysOfWeek", async () => {
    const res = await app.request("/roster-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pickupStopId: 10, dropoffStopId: 20, shiftScheduleId: 1, daysOfWeek: 128, effectiveFrom: "2026-06-01" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.request("/roster-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /roster-bookings/:id", () => {
  it("cancels a booking", async () => {
    mockCancelBooking.mockImplementation(() => Promise.resolve({ id: 1, status: "cancelled" }));

    const res = await app.request("/roster-bookings/1", {
      method: "DELETE",
      headers: authHeaders(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("cancelled");
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/roster-bookings/invalid", {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });
});
