import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { tripListQuerySchema, cancelTripRequestSchema, rateTripRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { listTrips, getTripDetail, cancelTrip, rateTrip } from "@/services/trips.service";
import { getTripLocation } from "@/services/tracking.service";
import { publishTripEvent } from "@/lib/event-bus";

export const tripsRouter = new Hono<AppEnv>();

tripsRouter.get("/", requireAuth, zValidator("query", tripListQuerySchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const filters = c.req.valid("query");
  const result = await listTrips(userId, role, { ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

tripsRouter.get("/:id", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const trip = await getTripDetail(tripId, userId, role);
  return c.json(trip);
});

tripsRouter.get("/:id/location", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const location = await getTripLocation(userId, tripId);
  return c.json(location);
});

tripsRouter.post("/:id/cancel", requireAuth, zValidator("json", cancelTripRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const { reason } = c.req.valid("json");
  const trip = await cancelTrip(tripId, userId, reason);
  publishTripEvent(tripId, { type: "status_change", tripId, status: "cancelled", timestamp: new Date().toISOString() });
  return c.json(trip);
});

tripsRouter.post("/:id/rate", requireAuth, zValidator("json", rateTripRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const { score, comment } = c.req.valid("json");
  const rating = await rateTrip(tripId, userId, score, comment);
  return c.json(rating, 201);
});
