import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { trips, tripPassengers, tripStops, employees, drivers } from "@/db/schema";
import { ratings } from "@/db/schema/ratings";
import { AppError, ErrorCode } from "@/lib/errors";
import { notifyTripPassengers } from "@/services/notifications.service";

function encodeCursor(createdAt: Date, id: number): string {
  return Buffer.from(`${createdAt.toISOString()}_${id}`).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: Date; id: number } {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  const idx = decoded.lastIndexOf("_");
  if (idx === -1) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid cursor");
  return { createdAt: new Date(decoded.slice(0, idx)), id: Number(decoded.slice(idx + 1)) };
}

async function getEmployeeId(userId: number): Promise<number | null> {
  const [row] = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  return row?.id ?? null;
}

async function getDriverId(userId: number): Promise<number | null> {
  const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return row?.id ?? null;
}

export async function listTrips(
  userId: number,
  role: string,
  filters: { status?: string; dateFrom?: string; dateTo?: string; cursor?: string; limit: number },
) {
  const limit = filters.limit;
  const conditions: ReturnType<typeof eq>[] = [];

  if (role === "employee") {
    const empId = await getEmployeeId(userId);
    if (!empId) return { items: [], nextCursor: undefined };
    conditions.push(eq(tripPassengers.employeeId, empId));
  } else if (role === "driver") {
    const drvId = await getDriverId(userId);
    if (!drvId) return { items: [], nextCursor: undefined };
    conditions.push(eq(trips.driverId, drvId));
  }

  if (filters.status) conditions.push(eq(trips.status, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(trips.scheduledDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(trips.scheduledDate, filters.dateTo));

  if (filters.cursor) {
    const { createdAt, id } = decodeCursor(filters.cursor);
    conditions.push(sql`(${trips.createdAt}, ${trips.id}) < (${createdAt}::timestamp, ${id})`);
  }

  const selectFields = {
    id: trips.id,
    routeId: trips.routeId,
    driverId: trips.driverId,
    vehicleId: trips.vehicleId,
    scheduledDate: trips.scheduledDate,
    status: trips.status,
    type: trips.type,
    source: trips.source,
    sourceId: trips.sourceId,
    createdAt: trips.createdAt,
  };

  if (role === "employee") {
    const rows = await db
      .select(selectFields)
      .from(trips)
      .innerJoin(tripPassengers, eq(trips.id, tripPassengers.tripId))
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt), desc(trips.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : undefined;

    return { items, nextCursor };
  }

  const rows = await db
    .select(selectFields)
    .from(trips)
    .where(and(...conditions))
    .orderBy(desc(trips.createdAt), desc(trips.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
    : undefined;

  return { items, nextCursor };
}

export async function getTripDetail(tripId: number, userId: number, role: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
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
    .where(eq(tripPassengers.tripId, tripId));

  if (role === "employee") {
    const empId = await getEmployeeId(userId);
    if (!empId || !passengers.some((p) => p.employeeId === empId)) {
      throw new AppError(ErrorCode.FORBIDDEN, "You are not a passenger on this trip");
    }
  }

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

export async function cancelTrip(tripId: number, userId: number, reason?: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  if (trip.status !== "scheduled") {
    throw new AppError(ErrorCode.CONFLICT, "Only scheduled trips can be cancelled");
  }

  const [cancelled] = await db
    .update(trips)
    .set({ status: "cancelled", cancelledBy: userId, cancelReason: reason ?? null })
    .where(eq(trips.id, tripId))
    .returning();

  await notifyTripPassengers(tripId, "Trip Cancelled", "Your trip has been cancelled");

  return cancelled;
}

export async function rateTrip(tripId: number, userId: number, score: number, comment?: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  if (trip.status !== "ongoing" && trip.status !== "cancelled") {
    throw new AppError(ErrorCode.CONFLICT, "Trip must be ongoing or cancelled to rate");
  }

  const empId = await getEmployeeId(userId);
  if (!empId) throw new AppError(ErrorCode.FORBIDDEN, "Only employees can rate trips");

  const [passenger] = await db
    .select()
    .from(tripPassengers)
    .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, empId)))
    .limit(1);
  if (!passenger) throw new AppError(ErrorCode.FORBIDDEN, "You are not a passenger on this trip");

  const [existing] = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.tripId, tripId), eq(ratings.fromUserId, userId)))
    .limit(1);
  if (existing) throw new AppError(ErrorCode.CONFLICT, "You have already rated this trip");

  const toUserId = trip.driverId
    ? (await db.select({ userId: drivers.userId }).from(drivers).where(eq(drivers.id, trip.driverId)).limit(1))[0]
        ?.userId
    : null;

  const [rating] = await db
    .insert(ratings)
    .values({ tripId, fromUserId: userId, toUserId: toUserId ?? userId, score, comment: comment ?? null })
    .returning();

  return rating;
}
