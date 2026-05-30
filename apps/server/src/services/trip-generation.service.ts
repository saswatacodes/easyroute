import { and, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rosterBookings, rosters, trips, tripPassengers, tripStops, shiftSchedules, routeStops, vehicles } from "@/db/schema";
import {
  generateLoginClusters,
  generateLogoutClusters,
  type BookingStop,
  type StopCoordinate,
} from "./route-optimizer.service";

function dayOfWeekToBitmaskIndex(dayOfWeek: number): number {
  return dayOfWeek - 1;
}

export async function generateTripsForDate(targetDate: string): Promise<{ created: number; skipped: number }> {
  const dateObj = new Date(targetDate);
  const dayIndex = dayOfWeekToBitmaskIndex(dateObj.getUTCDay() === 0 ? 7 : dateObj.getUTCDay());
  const bitmask = 1 << dayIndex;

  const bookings = await db
    .select({
      id: rosterBookings.id,
      employeeId: rosterBookings.employeeId,
      pickupStopId: rosterBookings.pickupStopId,
      dropoffStopId: rosterBookings.dropoffStopId,
      shiftScheduleId: rosterBookings.shiftScheduleId,
    })
    .from(rosterBookings)
    .where(
      and(
        ne(rosterBookings.status, "cancelled"),
        sql`(${rosterBookings.daysOfWeek} & ${bitmask}) = ${bitmask}`,
        lte(rosterBookings.effectiveFrom, targetDate),
        sql`COALESCE(${rosterBookings.effectiveUntil}, '9999-12-31') >= ${targetDate}`,
      ),
    );

  if (bookings.length === 0) return { created: 0, skipped: 0 };

  const routeOfStop = new Map<number, number | null>();

  for (const b of bookings) {
    if (b.pickupStopId && !routeOfStop.has(b.pickupStopId)) {
      const row = await db
        .select({ routeId: routeStops.routeId })
        .from(routeStops)
        .where(eq(routeStops.id, b.pickupStopId))
        .limit(1);
      routeOfStop.set(b.pickupStopId, row[0]?.routeId ?? null);
    }
    if (b.dropoffStopId && !routeOfStop.has(b.dropoffStopId)) {
      const row = await db
        .select({ routeId: routeStops.routeId })
        .from(routeStops)
        .where(eq(routeStops.id, b.dropoffStopId))
        .limit(1);
      routeOfStop.set(b.dropoffStopId, row[0]?.routeId ?? null);
    }
  }

  const groups = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const routeId = routeOfStop.get(b.pickupStopId ?? 0) ?? routeOfStop.get(b.dropoffStopId ?? 0) ?? null;
    const key = `${b.shiftScheduleId}_${routeId ?? "null"}`;
    const group = groups.get(key) ?? [];
    group.push(b);
    groups.set(key, group);
  }

  const [activeVehicle] = await db
    .select({ capacity: vehicles.capacity })
    .from(vehicles)
    .where(eq(vehicles.isActive, true))
    .limit(1);
  const capacity = activeVehicle?.capacity ?? 4;

  let created = 0;
  let skipped = 0;

  for (const [key, group] of groups) {
    const routeId = routeOfStop.get(group[0].pickupStopId ?? 0) ?? routeOfStop.get(group[0].dropoffStopId ?? 0) ?? null;

    const [existing] = await db
      .select({ id: rosters.id })
      .from(rosters)
      .where(
        and(
          eq(rosters.scheduledDate, targetDate),
          eq(rosters.shiftScheduleId, group[0].shiftScheduleId),
          routeId ? eq(rosters.routeId, routeId) : sql`1=1`,
        ),
      )
      .limit(1);

    if (existing) {
      skipped += group.length;
      continue;
    }

    const [shift] = await db
      .select({ startTime: shiftSchedules.startTime, endTime: shiftSchedules.endTime })
      .from(shiftSchedules)
      .where(eq(shiftSchedules.id, group[0].shiftScheduleId))
      .limit(1);
    if (!shift) {
      skipped += group.length;
      continue;
    }

    let office: StopCoordinate | null = null;
    if (routeId) {
      const officeRows = await db
        .select({ id: routeStops.id, lat: sql`ST_Y(${routeStops.location})`, lng: sql`ST_X(${routeStops.location})` })
        .from(routeStops)
        .where(and(eq(routeStops.routeId, routeId), eq(routeStops.isOffice, true)))
        .limit(1);
      office = officeRows[0]
        ? { id: officeRows[0].id, lat: Number(officeRows[0].lat), lng: Number(officeRows[0].lng) }
        : null;
    }
    if (!office && routeId) {
      skipped += group.length;
      continue;
    }

    const stopCoords = new Map<number, { lat: number; lng: number }>();
    const allStopIds = new Set<number>();
    for (const b of group) {
      if (b.pickupStopId) allStopIds.add(b.pickupStopId);
      if (b.dropoffStopId) allStopIds.add(b.dropoffStopId);
    }
    if (allStopIds.size > 0) {
      const stopRows = await db
        .select({ id: routeStops.id, lat: sql`ST_Y(${routeStops.location})`, lng: sql`ST_X(${routeStops.location})` })
        .from(routeStops)
        .where(sql`${routeStops.id} = ANY(${[...allStopIds]}::int[])`);
      for (const r of stopRows) {
        stopCoords.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    }

    const [roster] = await db
      .insert(rosters)
      .values({ routeId, shiftScheduleId: group[0].shiftScheduleId, scheduledDate: targetDate })
      .returning();

    await db
      .update(rosterBookings)
      .set({ rosterId: roster.id })
      .where(sql`${rosterBookings.id} = ANY(${group.map((b) => b.id)}::int[])`);

    if (routeId && office) {
      const pickupBookings: BookingStop[] = group
        .filter((b) => b.pickupStopId && stopCoords.has(b.pickupStopId))
        .map((b) => ({
          employeeId: b.employeeId,
          stopId: b.pickupStopId!,
          lat: stopCoords.get(b.pickupStopId!)!.lat,
          lng: stopCoords.get(b.pickupStopId!)!.lng,
        }));

      const dropoffBookings: BookingStop[] = group
        .filter((b) => b.dropoffStopId && stopCoords.has(b.dropoffStopId))
        .map((b) => ({
          employeeId: b.employeeId,
          stopId: b.dropoffStopId!,
          lat: stopCoords.get(b.dropoffStopId!)!.lat,
          lng: stopCoords.get(b.dropoffStopId!)!.lng,
        }));

      const loginClusters = pickupBookings.length > 0
        ? generateLoginClusters(pickupBookings, office, capacity, shift.startTime)
        : [];

      const logoutClusters = dropoffBookings.length > 0
        ? generateLogoutClusters(dropoffBookings, office, capacity, shift.endTime)
        : [];

      for (const cluster of loginClusters) {
        const [trip] = await db
          .insert(trips)
          .values({
            routeId,
            shiftScheduleId: group[0].shiftScheduleId,
            scheduledDate: targetDate,
            type: "login_trip",
            source: "roster",
            sourceId: roster.id,
          })
          .returning();

        await db.insert(tripPassengers).values(
          cluster.passengers.map((p) => ({
            tripId: trip.id,
            employeeId: p.employeeId,
            stopId: p.stopId,
            loginTime: shift.startTime,
          })),
        );

        if (cluster.orderedStops.length > 0) {
          await db.insert(tripStops).values(
            cluster.orderedStops.map((s) => ({
              tripId: trip.id,
              stopId: s.stopId,
              sequence: s.sequence,
              type: s.type,
              scheduledArrival: s.scheduledArrival,
            })),
          );
        }

        created += cluster.passengers.length;
      }

      for (const cluster of logoutClusters) {
        const [trip] = await db
          .insert(trips)
          .values({
            routeId,
            shiftScheduleId: group[0].shiftScheduleId,
            scheduledDate: targetDate,
            type: "logout_trip",
            source: "roster",
            sourceId: roster.id,
          })
          .returning();

        await db.insert(tripPassengers).values(
          cluster.passengers.map((p) => ({
            tripId: trip.id,
            employeeId: p.employeeId,
            stopId: p.stopId,
            logoutTime: shift.endTime,
          })),
        );

        if (cluster.orderedStops.length > 0) {
          await db.insert(tripStops).values(
            cluster.orderedStops.map((s) => ({
              tripId: trip.id,
              stopId: s.stopId,
              sequence: s.sequence,
              type: s.type,
              scheduledArrival: s.scheduledArrival,
            })),
          );
        }

        created += cluster.passengers.length;
      }
    } else {
      for (const b of group) {
        const [trip] = await db
          .insert(trips)
          .values({
            shiftScheduleId: group[0].shiftScheduleId,
            scheduledDate: targetDate,
            type: "login_trip",
            source: "roster",
          })
          .returning();

        await db.insert(tripPassengers).values({
          tripId: trip.id,
          employeeId: b.employeeId,
          stopId: b.pickupStopId,
          loginTime: shift.startTime,
        });
      }
      created += group.length;
    }
  }

  return { created, skipped };
}
