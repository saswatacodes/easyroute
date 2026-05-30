import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { drivers, locationPings, trips } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";

async function getDriverId(userId: number): Promise<number> {
  const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (!row) throw new AppError(ErrorCode.FORBIDDEN, "Driver profile not found");
  return row.id;
}

export async function toggleAvailability(userId: number, available: boolean) {
  const driverId = await getDriverId(userId);
  const [updated] = await db.update(drivers).set({ available }).where(eq(drivers.id, driverId)).returning();
  return updated;
}

export async function storeLocationPing(userId: number, tripId: number, lat: number, lng: number) {
  const driverId = await getDriverId(userId);

  const [trip] = await db
    .select({ driverId: trips.driverId })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.driverId, driverId)))
    .limit(1);

  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found or not assigned to you");

  const [ping] = await db
    .insert(locationPings)
    .values({ driverId, tripId, lat, lng })
    .returning();

  return { lat: ping.lat, lng: ping.lng, timestamp: ping.timestamp.toISOString() };
}

export async function getTripLocation(userId: number, tripId: number) {
  const [trip] = await db
    .select({ driverId: trips.driverId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  const [ping] = await db
    .select()
    .from(locationPings)
    .where(and(eq(locationPings.tripId, tripId), isNotNull(locationPings.driverId)))
    .orderBy(desc(locationPings.timestamp))
    .limit(1);

  if (!ping) return null;

  return {
    driverId: ping.driverId,
    lat: ping.lat,
    lng: ping.lng,
    timestamp: ping.timestamp.toISOString(),
    tripId: ping.tripId,
  };
}
