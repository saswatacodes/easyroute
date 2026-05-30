import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import {
  driverTripQuerySchema,
  updateTripStatusSchema,
  updateAvailabilityRequestSchema,
  locationPingRequestSchema,
} from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { requireRole } from "@/lib/middlewares/role-guard";
import {
  getDriverTrips,
  getDriverTripDetail,
  updateTripStatus,
  boardPassenger,
  dropPassenger,
} from "@/services/driver.service";
import { toggleAvailability, storeLocationPing } from "@/services/tracking.service";
import { publishTripEvent } from "@/lib/event-bus";

export const driverRouter = new Hono<AppEnv>();

driverRouter.use(requireAuth, requireRole("driver", "admin"));

driverRouter.get("/trips", zValidator("query", driverTripQuerySchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const filters = c.req.valid("query");
  const result = await getDriverTrips(userId, { ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

driverRouter.get("/trips/:id", async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const trip = await getDriverTripDetail(userId, tripId);
  return c.json(trip);
});

driverRouter.patch("/trips/:id/status", zValidator("json", updateTripStatusSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const { status } = c.req.valid("json");
  const trip = await updateTripStatus(userId, tripId, status);
  publishTripEvent(tripId, { type: "status_change", tripId, status, timestamp: new Date().toISOString() });
  return c.json(trip);
});

driverRouter.post("/trips/:id/passengers/:employeeId/board", async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  const employeeId = parseInt(c.req.param("employeeId")!, 10);
  if (isNaN(tripId) || isNaN(employeeId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip or employee id");
  const result = await boardPassenger(userId, tripId, employeeId);
  return c.json(result);
});

driverRouter.post("/trips/:id/passengers/:employeeId/drop", async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  const employeeId = parseInt(c.req.param("employeeId")!, 10);
  if (isNaN(tripId) || isNaN(employeeId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip or employee id");
  const result = await dropPassenger(userId, tripId, employeeId);
  return c.json(result);
});

driverRouter.patch("/availability", zValidator("json", updateAvailabilityRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const { available } = c.req.valid("json");
  const result = await toggleAvailability(userId, available);
  return c.json(result);
});

driverRouter.post("/trips/:id/location", zValidator("json", locationPingRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const { lat, lng } = c.req.valid("json");
  const result = await storeLocationPing(userId, tripId, lat, lng);
  return c.json(result);
});
