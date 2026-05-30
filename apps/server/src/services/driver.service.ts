import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trips, tripPassengers, tripStops, drivers, users, employees } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { notifyUser, notifyTripPassengers } from "@/services/notifications.service";

const STATUS_MESSAGES: Record<string, string> = {
  en_route: "Your driver is on the way",
  at_pickup: "Your driver has arrived at the pickup location",
  ongoing: "Your trip is in progress",
  completed: "Your trip has been completed",
  cancelled: "Your trip has been cancelled",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["en_route"],
  en_route: ["at_pickup", "cancelled"],
  at_pickup: ["ongoing", "cancelled"],
  ongoing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

async function getDriverId(userId: number): Promise<number> {
  const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (!row) throw new AppError(ErrorCode.FORBIDDEN, "Driver profile not found");
  return row.id;
}

async function assertTripDriver(tripId: number, driverId: number) {
  const [trip] = await db.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");
  if (trip.driverId !== driverId) throw new AppError(ErrorCode.FORBIDDEN, "You are not the driver of this trip");
}

export async function getDriverTrips(
  userId: number,
  filters: { date?: string; status?: string; cursor?: string; limit: number },
) {
  const driverId = await getDriverId(userId);
  const conditions = [eq(trips.driverId, driverId)];

  if (filters.date) conditions.push(eq(trips.scheduledDate, filters.date));
  if (filters.status) conditions.push(eq(trips.status, filters.status as any));

  if (filters.cursor) {
    const decoded = Buffer.from(filters.cursor, "base64").toString("utf8");
    const idx = decoded.lastIndexOf("_");
    if (idx === -1) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cursor");
    conditions.push(
      sql`(${trips.scheduledDate}, ${trips.id}) < (${decoded.slice(0, idx)}::date, ${Number(decoded.slice(idx + 1))})`,
    );
  }

  const limit = filters.limit;
  const rows = await db
    .select({
      id: trips.id,
      routeId: trips.routeId,
      driverId: trips.driverId,
      vehicleId: trips.vehicleId,
      scheduledDate: trips.scheduledDate,
      status: trips.status,
      type: trips.type,
      source: trips.source,
      passengerCount: sql<number>`count(${tripPassengers.employeeId})::int`,
      boardedCount: sql<number>`count(${tripPassengers.boardedAt})::int`,
      droppedCount: sql<number>`count(${tripPassengers.droppedAt})::int`,
    })
    .from(trips)
    .leftJoin(tripPassengers, eq(trips.id, tripPassengers.tripId))
    .where(and(...conditions))
    .groupBy(trips.id)
    .orderBy(desc(trips.scheduledDate), desc(trips.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(`${last.scheduledDate}_${last.id}`).toString("base64")
      : undefined;

  return { items, nextCursor };
}

export async function getDriverTripDetail(userId: number, tripId: number) {
  const driverId = await getDriverId(userId);

  const [trip] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.driverId, driverId))).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  const passengers = await db
    .select({
      employeeId: tripPassengers.employeeId,
      stopId: tripPassengers.stopId,
      loginTime: tripPassengers.loginTime,
      logoutTime: tripPassengers.logoutTime,
      boardedAt: tripPassengers.boardedAt,
      droppedAt: tripPassengers.droppedAt,
    })
    .from(tripPassengers)
    .where(eq(tripPassengers.tripId, tripId))
    .orderBy(asc(tripPassengers.employeeId));

  const stops = await db
    .select({
      id: tripStops.id,
      stopId: tripStops.stopId,
      sequence: tripStops.sequence,
      type: tripStops.type,
      scheduledArrival: tripStops.scheduledArrival,
      actualArrival: tripStops.actualArrival,
    })
    .from(tripStops)
    .where(eq(tripStops.tripId, tripId))
    .orderBy(asc(tripStops.sequence));

  return { ...trip, passengers, tripStops: stops };
}

export async function updateTripStatus(userId: number, tripId: number, newStatus: string) {
  const driverId = await getDriverId(userId);
  await assertTripDriver(tripId, driverId);

  const [trip] = await db.select({ status: trips.status }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  const allowed = VALID_TRANSITIONS[trip.status];
  if (!allowed?.includes(newStatus)) {
    throw new AppError(
      ErrorCode.CONFLICT,
      `Cannot transition from "${trip.status}" to "${newStatus}"`,
    );
  }

  const [updated] = await db
    .update(trips)
    .set({ status: newStatus as any })
    .where(eq(trips.id, tripId))
    .returning();

  const message = STATUS_MESSAGES[newStatus];
  if (message) {
    await notifyTripPassengers(tripId, "Trip Update", message);
  }

  return updated;
}

export async function boardPassenger(userId: number, tripId: number, employeeId: number) {
  const driverId = await getDriverId(userId);
  await assertTripDriver(tripId, driverId);

  const [passenger] = await db
    .select()
    .from(tripPassengers)
    .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, employeeId)))
    .limit(1);

  if (!passenger) throw new AppError(ErrorCode.NOT_FOUND, "Passenger not on this trip");
  if (passenger.boardedAt) throw new AppError(ErrorCode.CONFLICT, "Passenger already boarded");

  const passengerUserId = await getPassengerUserId(employeeId);

  await db
    .update(tripPassengers)
    .set({ boardedAt: sql`now()` })
    .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, employeeId)));

  if (passengerUserId) {
    await notifyUser(passengerUserId, "Boarded", "You have been marked as boarded");
  }

  return { boardedAt: new Date().toISOString() };
}

async function getPassengerUserId(employeeId: number): Promise<number | null> {
  const [row] = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(employees, eq(users.id, employees.userId))
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row?.userId ?? null;
}

export async function dropPassenger(userId: number, tripId: number, employeeId: number) {
  const driverId = await getDriverId(userId);
  await assertTripDriver(tripId, driverId);

  const [passenger] = await db
    .select()
    .from(tripPassengers)
    .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, employeeId)))
    .limit(1);

  if (!passenger) throw new AppError(ErrorCode.NOT_FOUND, "Passenger not on this trip");
  if (!passenger.boardedAt) throw new AppError(ErrorCode.CONFLICT, "Passenger has not boarded yet");
  if (passenger.droppedAt) throw new AppError(ErrorCode.CONFLICT, "Passenger already dropped off");

  const passengerUserId = await getPassengerUserId(employeeId);

  await db
    .update(tripPassengers)
    .set({ droppedAt: sql`now()` })
    .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, employeeId)));

  if (passengerUserId) {
    await notifyUser(passengerUserId, "Dropped Off", "You have been dropped off");
  }

  return { droppedAt: new Date().toISOString() };
}
