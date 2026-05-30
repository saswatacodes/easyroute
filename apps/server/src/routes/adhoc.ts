import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { createAdhocTripRequestSchema, adhocTripListQuerySchema, verifyOtpRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { listAdhocTrips, getAdhocTripDetail, createAdhocTrip, cancelAdhocTrip, verifyAdhocOtp } from "@/services/adhoc-trips.service";

export const adhocRouter = new Hono<AppEnv>();

adhocRouter.get("/", requireAuth, zValidator("query", adhocTripListQuerySchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const filters = c.req.valid("query");
  const result = await listAdhocTrips(userId, role, { ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

adhocRouter.get("/:id", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid ad-hoc trip id");
  const trip = await getAdhocTripDetail(userId, role, tripId);
  return c.json(trip);
});

adhocRouter.post("/", requireAuth, zValidator("json", createAdhocTripRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const body = c.req.valid("json");
  const trip = await createAdhocTrip(userId, body);
  return c.json(trip, 201);
});

adhocRouter.post("/:id/cancel", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid ad-hoc trip id");
  const trip = await cancelAdhocTrip(userId, role, tripId);
  return c.json(trip);
});

const verifyOtpParamsSchema = z.object({ type: z.enum(["login", "logout"]), otp: z.string() });
adhocRouter.post("/:id/verify-otp", requireAuth, zValidator("json", verifyOtpRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const tripId = parseInt(c.req.param("id")!, 10);
  if (isNaN(tripId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid ad-hoc trip id");
  const { type, otp } = c.req.valid("json");
  const result = await verifyAdhocOtp(userId, role, tripId, otp, type);
  return c.json(result);
});
