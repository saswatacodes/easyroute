import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { requireRole } from "@/lib/middlewares/role-guard";
import { AppError, ErrorCode } from "@/lib/errors";
import {
  allocateDriverRequestSchema,
  adminTripQuerySchema,
  adminCreateUserRequestSchema,
  adminUpdateUserRequestSchema,
  adminCreateRouteRequestSchema,
  adminUpdateRouteRequestSchema,
  adminAdhocTripQuerySchema,
  createVehicleRequestSchema,
  updateVehicleRequestSchema,
} from "@easyroute/shared";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminListVehicles,
  adminCreateVehicle,
  adminUpdateVehicle,
  adminDeleteVehicle,
  adminListRoutes,
  adminCreateRoute,
  adminUpdateRoute,
  adminDeleteRoute,
  adminListTrips,
  adminAllocateTrip,
  adminListAdhocTrips,
  adminAllocateAdhocTrip,
} from "@/services/admin.service";
import { generateTripsForDate } from "@/services/trip-generation.service";

export const adminRouter = new Hono<AppEnv>();
adminRouter.use(requireAuth, requireRole("admin"));

// --- Users ---
adminRouter.get("/users", async (c) => {
  const result = await adminListUsers();
  return c.json(result);
});

adminRouter.post("/users", zValidator("json", adminCreateUserRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const user = await adminCreateUser(body);
  return c.json(user, 201);
});

adminRouter.get("/users/:id", async (c) => {
  const userId = parseInt(c.req.param("id")!, 10);
  if (isNaN(userId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid user id");
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "User not found");
  return c.json(row);
});

adminRouter.patch("/users/:id", zValidator("json", adminUpdateUserRequestSchema), async (c) => {
  const userId = parseInt(c.req.param("id")!, 10);
  if (isNaN(userId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid user id");
  const body = c.req.valid("json");
  const user = await adminUpdateUser(userId, body);
  return c.json(user);
});

adminRouter.delete("/users/:id", async (c) => {
  const userId = parseInt(c.req.param("id")!, 10);
  if (isNaN(userId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid user id");
  const result = await adminDeleteUser(userId);
  return c.json(result);
});

// --- Vehicles ---
adminRouter.get("/vehicles", async (c) => {
  const result = await adminListVehicles();
  return c.json(result);
});

adminRouter.post("/vehicles", zValidator("json", createVehicleRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const vehicle = await adminCreateVehicle(body);
  return c.json(vehicle, 201);
});

adminRouter.put("/vehicles/:id", zValidator("json", updateVehicleRequestSchema), async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid vehicle id");
  const body = c.req.valid("json");
  const vehicle = await adminUpdateVehicle(id, body);
  return c.json(vehicle);
});

adminRouter.delete("/vehicles/:id", async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid vehicle id");
  const result = await adminDeleteVehicle(id);
  return c.json(result);
});

// --- Routes ---
adminRouter.get("/routes", async (c) => {
  const result = await adminListRoutes();
  return c.json(result);
});

adminRouter.post("/routes", zValidator("json", adminCreateRouteRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const route = await adminCreateRoute(body);
  return c.json(route, 201);
});

adminRouter.put("/routes/:id", zValidator("json", adminUpdateRouteRequestSchema), async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid route id");
  const body = c.req.valid("json");
  const route = await adminUpdateRoute(id, body);
  return c.json(route);
});

adminRouter.delete("/routes/:id", async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid route id");
  const result = await adminDeleteRoute(id);
  return c.json(result);
});

// --- Trips ---
adminRouter.get("/trips", zValidator("query", adminTripQuerySchema), async (c) => {
  const filters = c.req.valid("query");
  const result = await adminListTrips({ ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

adminRouter.patch("/trips/:id/allocate", zValidator("json", allocateDriverRequestSchema), async (c) => {
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid trip id");
  const { driverId, vehicleId } = c.req.valid("json");
  const trip = await adminAllocateTrip(tripId, driverId, vehicleId);
  return c.json(trip);
});

// --- Ad-hoc Trips ---
adminRouter.get("/adhoc-trips", zValidator("query", adminAdhocTripQuerySchema), async (c) => {
  const filters = c.req.valid("query");
  const result = await adminListAdhocTrips({ ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

adminRouter.patch("/adhoc-trips/:id/allocate", zValidator("json", allocateDriverRequestSchema), async (c) => {
  const adhocTripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(adhocTripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid adhoc trip id");
  const { driverId } = c.req.valid("json");
  const trip = await adminAllocateAdhocTrip(adhocTripId, driverId);
  return c.json(trip);
});

// --- Cron ---
const generateTripsRequestSchema = z.object({
  date: z.string().optional(),
});

adminRouter.post("/cron/generate-trips", zValidator("json", generateTripsRequestSchema), async (c) => {
  const { date } = c.req.valid("json");
  const targetDate = date ?? new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const result = await generateTripsForDate(targetDate);
  return c.json(result);
});
