import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─── Queue attached to mock object, fresh per test ────────────────
let mockState: { queue: any[] } = { queue: [] };

function makeChain() {
  return {
    from: () => makeChain(),
    where: () => makeChain(),
    orderBy: () => makeChain(),
    offset: () => makeChain(),
    innerJoin: () => makeChain(),
    leftJoin: () => makeChain(),
    groupBy: () => makeChain(),
    limit: () => Promise.resolve(mockState.queue.shift() ?? []),
    then: (onFulfilled: any) => Promise.resolve(mockState.queue.shift() ?? []).then(onFulfilled),
    returning: () => Promise.resolve(mockState.queue.shift() ?? []),
    set: () => makeChain(),
    values: () => makeChain(),
  };
}

const roleChain = {
  from: () => roleChain,
  where: () => roleChain,
  limit: () => Promise.resolve([{ role: "driver" }]),
  then: (onFulfilled: any) => Promise.resolve([{ role: "driver" }]).then(onFulfilled),
};

const mockDb: any = {
  select: mock((fields?: any) => {
    if (fields && "role" in fields) return roleChain;
    return makeChain();
  }),
  insert: mock(() => makeChain()),
  update: mock(() => makeChain()),
};

mock.module("@/db", () => ({ db: mockDb }));

const {
  getDriverTrips,
  getDriverTripDetail,
  updateTripStatus,
  boardPassenger,
  dropPassenger,
} = await import("@/services/driver.service");

async function expectRejected(fn: () => Promise<any>, code: string) {
  try {
    await fn();
    throw new Error("Expected rejection but got resolve");
  } catch (e: any) {
    expect(e.code).toBe(code);
  }
}

describe("getDriverTrips", () => {
  beforeEach(() => { mockState = { queue: [] }; });

  it("returns driver trips with passenger counts", async () => {
    mockState.queue.push([{ id: 1 }]);
    mockState.queue.push([{ id: 1, routeId: 10, status: "scheduled", source: "roster", scheduledDate: "2026-06-01", passengerCount: 3, boardedCount: 1, droppedCount: 0 }]);
    const result = await getDriverTrips(1, { limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].passengerCount).toBe(3);
  });

  it("throws when driver profile not found", async () => {
    mockState.queue.push([]);
    await expectRejected(() => getDriverTrips(1, { limit: 20 }), "FORBIDDEN");
  });
});

describe("getDriverTripDetail", () => {
  beforeEach(() => { mockState = { queue: [] }; });

  it("returns trip with passengers", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ id: 1, routeId: 10, status: "scheduled", type: "login_trip", scheduledDate: "2026-06-01", driverId: 5 }]);
    mockState.queue.push([{ employeeId: 1, stopId: 10, loginTime: null, logoutTime: null, boardedAt: null, droppedAt: null }]);
    mockState.queue.push([]);
    const result = await getDriverTripDetail(1, 1);
    expect(result.id).toBe(1);
    expect(result.passengers).toHaveLength(1);
  });

  it("throws when not driver's trip", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([]);
    await expectRejected(() => getDriverTripDetail(1, 999), "NOT_FOUND");
  });
});

describe("updateTripStatus", () => {
  beforeEach(() => { mockState = { queue: [] }; });

  it("transitions scheduled → en_route", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ status: "scheduled" }]);
    mockState.queue.push([{ id: 1, status: "en_route" }]);
    const result = await updateTripStatus(1, 1, "en_route");
    expect(result.status).toBe("en_route");
  });

  it("throws on invalid transition", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ status: "scheduled" }]);
    await expectRejected(() => updateTripStatus(1, 1, "completed"), "CONFLICT");
  });
});

describe("boardPassenger", () => {
  beforeEach(() => { mockState = { queue: [] }; });

  it("boards a passenger", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ employeeId: 1, boardedAt: null, droppedAt: null }]);
    const result = await boardPassenger(1, 1, 1);
    expect(result).toHaveProperty("boardedAt");
  });

  it("throws when passenger not on trip", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([]);
    await expectRejected(() => boardPassenger(1, 1, 1), "NOT_FOUND");
  });

  it("throws when passenger already boarded", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ employeeId: 1, boardedAt: new Date(), droppedAt: null }]);
    await expectRejected(() => boardPassenger(1, 1, 1), "CONFLICT");
  });
});

describe("dropPassenger", () => {
  beforeEach(() => { mockState = { queue: [] }; });

  it("drops a passenger", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ employeeId: 1, boardedAt: new Date(), droppedAt: null }]);
    const result = await dropPassenger(1, 1, 1);
    expect(result).toHaveProperty("droppedAt");
  });

  it("throws when passenger not boarded yet", async () => {
    mockState.queue.push([{ id: 5 }]);
    mockState.queue.push([{ driverId: 5 }]);
    mockState.queue.push([{ employeeId: 1, boardedAt: null, droppedAt: null }]);
    await expectRejected(() => dropPassenger(1, 1, 1), "CONFLICT");
  });
});
