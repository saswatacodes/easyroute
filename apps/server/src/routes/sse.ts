import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { trips, tripPassengers, drivers, employees } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { subscribeTrip, subscribeDriver } from "@/lib/event-bus";

export const sseRouter = new Hono<AppEnv>();

sseRouter.get("/trips/:id/stream", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");

  if (role === "employee") {
    const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
    if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
    const [passenger] = await db
      .select()
      .from(tripPassengers)
      .where(and(eq(tripPassengers.tripId, tripId), eq(tripPassengers.employeeId, emp[0].id)))
      .limit(1);
    if (!passenger) throw new AppError(ErrorCode.FORBIDDEN, "You are not a passenger on this trip");
  } else if (role === "driver") {
    const drv = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
    if (!drv[0] || trip.driverId !== drv[0].id) throw new AppError(ErrorCode.FORBIDDEN, "You are not the driver of this trip");
  } else {
    throw new AppError(ErrorCode.FORBIDDEN, "Access denied");
  }

  return streamSSE(c, async (stream) => {
    const sendEvent = (event: any) => {
      if (stream.closed || stream.aborted) return;
      stream.writeSSE({ data: JSON.stringify(event), event: "message" }).catch(() => {});
    };

    const unsub = subscribeTrip(tripId, sendEvent);
    stream.onAbort(() => unsub());

    while (!stream.closed && !stream.aborted) {
      await stream.sleep(30000);
      if (stream.closed || stream.aborted) break;
      await stream.writeSSE({ event: "heartbeat", data: "ping" });
    }

    unsub();
  });
});

sseRouter.get("/drivers/trips/stream", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  if (role !== "driver") throw new AppError(ErrorCode.FORBIDDEN, "Only drivers can subscribe to driver streams");

  const drv = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (!drv[0]) throw new AppError(ErrorCode.FORBIDDEN, "Driver profile not found");
  const driverId = drv[0].id;

  return streamSSE(c, async (stream) => {
    const sendEvent = (event: any) => {
      if (stream.closed || stream.aborted) return;
      stream.writeSSE({ data: JSON.stringify(event), event: "message" }).catch(() => {});
    };

    const unsub = subscribeDriver(driverId, sendEvent);
    stream.onAbort(() => unsub());

    while (!stream.closed && !stream.aborted) {
      await stream.sleep(30000);
      if (stream.closed || stream.aborted) break;
      await stream.writeSSE({ event: "heartbeat", data: "ping" });
    }

    unsub();
  });
});
