import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─── Shared DB mock ───────────────────────────────────────────────
let resultQueue: any[] = [];

const selectChain = {
  from: () => selectChain,
  where: () => selectChain,
  orderBy: () => selectChain,
  offset: () => selectChain,
  innerJoin: () => selectChain,
  limit: () => Promise.resolve(resultQueue.shift() ?? []),
  then: (onFulfilled: any) => Promise.resolve(resultQueue.shift() ?? []).then(onFulfilled),
};

const roleChain = {
  from: () => roleChain,
  where: () => roleChain,
  limit: () => Promise.resolve([{ role: "admin" }]),
  then: (onFulfilled: any) => Promise.resolve([{ role: "admin" }]).then(onFulfilled),
};

const returningChain = {
  set: () => returningChain,
  where: () => returningChain,
  returning: () => Promise.resolve(resultQueue.shift() ?? []),
  then: (onFulfilled: any) => Promise.resolve(resultQueue.shift() ?? []).then(onFulfilled),
};

const mockDb: any = {
  select: mock((fields?: any) => {
    if (fields && "role" in fields) return roleChain;
    return selectChain;
  }),
  insert: mock(() => ({ values: () => returningChain })),
  update: mock(() => ({ set: () => ({ where: () => returningChain }) })),
  execute: mock(() => Promise.resolve(resultQueue.shift() ?? [])),
};

mock.module("@/db", () => ({ db: mockDb }));

// ─── ───────────────────────────────────────────────────────────────

// ─── Route inference service ──────────────────────────────────────
const { inferRouteFromStops } = await import("@/services/route-inference.service");

describe("inferRouteFromStops", () => {
  beforeEach(() => {
    resultQueue = [];
  });

  it("returns null when pickup or dropoff is missing", async () => {
    expect(await inferRouteFromStops(null, 1)).toBeNull();
    expect(await inferRouteFromStops(1, null)).toBeNull();
    expect(await inferRouteFromStops(null, null)).toBeNull();
  });

  it("returns null when pickup stop not found", async () => {
    resultQueue.push([]);
    expect(await inferRouteFromStops(1, 2)).toBeNull();
  });

  it("returns null when dropoff stop not found", async () => {
    resultQueue.push([{ routeId: 1, sequence: 1 }]);
    resultQueue.push([]);
    expect(await inferRouteFromStops(1, 2)).toBeNull();
  });

  it("returns null when pickup and dropoff are on different routes", async () => {
    resultQueue.push([{ routeId: 1, sequence: 1 }]);
    resultQueue.push([{ routeId: 2, sequence: 1 }]);
    expect(await inferRouteFromStops(1, 2)).toBeNull();
  });

  it("returns null when pickup sequence >= dropoff sequence", async () => {
    resultQueue.push([{ routeId: 1, sequence: 5 }]);
    resultQueue.push([{ routeId: 1, sequence: 3 }]);
    expect(await inferRouteFromStops(1, 2)).toBeNull();
  });

  it("returns routeId when pickup is before dropoff on same route", async () => {
    resultQueue.push([{ routeId: 1, sequence: 2 }]);
    resultQueue.push([{ routeId: 1, sequence: 5 }]);
    const result = await inferRouteFromStops(1, 2);
    expect(result).toEqual({ routeId: 1 });
  });
});

// ─── Trip generation service ──────────────────────────────────────
const { generateTripsForDate } = await import("@/services/trip-generation.service");

describe("generateTripsForDate", () => {
  beforeEach(() => {
    resultQueue = [];
  });

  it("returns 0 when no bookings match", async () => {
    resultQueue.push([]);
    const result = await generateTripsForDate("2026-06-01");
    expect(result).toEqual({ created: 0, skipped: 0 });
  });

  it("creates trips for matching bookings without route", async () => {
    resultQueue.push([{ id: 1, employeeId: 10, pickupStopId: null, dropoffStopId: null, shiftScheduleId: 5 }]);
    resultQueue.push([{ capacity: 4 }]); // vehicle lookup
    resultQueue.push([]); // existing roster check
    resultQueue.push([{ startTime: "09:00", endTime: "17:00" }]); // shift lookup
    resultQueue.push([{ id: "roster-1" }]); // roster insert returning
    resultQueue.push([]); // booking update (thenable)
    resultQueue.push([{ id: "trip-1" }]); // trips insert returning
    resultQueue.push([]); // tripPassengers insert (thenable)

    const result = await generateTripsForDate("2026-06-01");
    expect(result).toEqual({ created: 1, skipped: 0 });
  });

  it("creates trips for bookings with route", async () => {
    resultQueue.push([{ id: 1, employeeId: 10, pickupStopId: 1, dropoffStopId: 2, shiftScheduleId: 5 }]);
    resultQueue.push([{ routeId: 1, sequence: 1 }]); // routeOfStop for pickupStopId
    resultQueue.push([{ routeId: 1, sequence: 3 }]); // routeOfStop for dropoffStopId
    resultQueue.push([{ capacity: 4 }]); // vehicle lookup
    resultQueue.push([]); // existing roster check
    resultQueue.push([{ startTime: "09:00", endTime: "17:00" }]); // shift lookup
    resultQueue.push([{ id: 100, lat: 28.6, lng: 77.2 }]); // office lookup
    resultQueue.push([{ id: 1, lat: 28.45, lng: 77.05 }, { id: 2, lat: 28.48, lng: 77.08 }]); // stop coords
    resultQueue.push([{ id: "roster-1" }]); // roster insert returning
    resultQueue.push([]); // booking update (thenable)
    resultQueue.push([{ id: "login-trip-1" }]); // login trip insert returning
    resultQueue.push([]); // login tripPassengers insert (thenable)
    resultQueue.push([]); // login tripStops insert (thenable)
    resultQueue.push([{ id: "logout-trip-1" }]); // logout trip insert returning
    resultQueue.push([]); // logout tripPassengers insert (thenable)
    resultQueue.push([]); // logout tripStops insert (thenable)

    const result = await generateTripsForDate("2026-06-01");
    expect(result).toEqual({ created: 2, skipped: 0 });
  });

  it("skips duplicate groups", async () => {
    resultQueue.push([{ id: 1, employeeId: 10, pickupStopId: null, dropoffStopId: null, shiftScheduleId: 5 }]);
    resultQueue.push([{ capacity: 4 }]); // vehicle lookup
    resultQueue.push([{ id: "existing-1" }]); // existing roster found → skip

    const result = await generateTripsForDate("2026-06-01");
    expect(result).toEqual({ created: 0, skipped: 1 });
  });
});

// ─── Roster service ───────────────────────────────────────────────
const { getEmployeeBookings, createBooking, cancelBooking } = await import("@/services/roster.service");

describe("roster.service - getEmployeeBookings", () => {
  beforeEach(() => {
    resultQueue = [];
    mockDb.select.mockReset();
    mockDb.select.mockImplementation((fields?: any) => {
      if (fields && "role" in fields) return roleChain;
      return selectChain;
    });
  });

  it("returns bookings for the employee", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => selectChain);

    resultQueue.push([{ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01" }]);

    const result = await getEmployeeBookings(1);
    expect(result).toMatchObject([{ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01" }]);
  });

  it("throws 404 when employee profile not found", async () => {
    mockDb.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }));

    expect(getEmployeeBookings(1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("roster.service - createBooking", () => {
  const bookingData = {
    pickupStopId: 10,
    dropoffStopId: 20,
    shiftScheduleId: 1,
    daysOfWeek: 31,
    effectiveFrom: "2026-06-01",
  };

  beforeEach(() => {
    resultQueue = [];
    mockDb.select.mockReset();
    mockDb.select.mockImplementation((fields?: any) => {
      if (fields && "role" in fields) return roleChain;
      return selectChain;
    });
    mockDb.insert.mockReset();
    mockDb.insert.mockImplementation(() => ({ values: () => returningChain }));
  });

  it("creates a booking when no conflict", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => selectChain);

    resultQueue.push([]); // no conflict
    resultQueue.push([{ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01", status: "scheduled" }]);

    const result = await createBooking(1, bookingData);
    expect(result).toMatchObject({ id: 1, shiftScheduleId: 1, daysOfWeek: 31, effectiveFrom: "2026-06-01", status: "scheduled" });
  });

  it("throws 409 on overlapping booking", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => selectChain);

    resultQueue.push([{ id: 99 }]); // conflict found

    expect(createBooking(1, bookingData)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("roster.service - cancelBooking", () => {
  beforeEach(() => {
    resultQueue = [];
    mockDb.select.mockReset();
    mockDb.select.mockImplementation((fields?: any) => {
      if (fields && "role" in fields) return roleChain;
      return selectChain;
    });
    mockDb.update.mockReset();
    mockDb.update.mockImplementation(() => ({
      set: () => ({
        where: () => returningChain,
      }),
    }));
  });

  it("cancels an active booking", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1, employeeId: 5, status: "scheduled" }]) }) }),
      }));

    mockDb.update.mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: 1, employeeId: 5, status: "cancelled" }]),
        }),
      }),
    }));

    const result = await cancelBooking(1, 1);
    expect(result).toMatchObject({ id: 1, employeeId: 5, status: "cancelled" });
  });

  it("throws 404 when booking not found", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      }));

    expect(cancelBooking(999, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws 403 when cancelling another employee's booking", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1, employeeId: 99, status: "scheduled" }]) }) }),
      }));

    expect(cancelBooking(1, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws 409 when booking already cancelled", async () => {
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 5 }]) }) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1, employeeId: 5, status: "cancelled" }]) }) }),
      }));

    expect(cancelBooking(1, 1)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
