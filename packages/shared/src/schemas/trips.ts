import { z } from "zod";

export const tripStatusSchema = z.enum(["scheduled", "en_route", "at_pickup", "ongoing", "completed", "cancelled"]);

export const tripTypeSchema = z.enum(["login_trip", "logout_trip"]);

export const tripSchema = z.object({
  id: z.number(),
  routeId: z.number().nullable(),
  driverId: z.number().nullable(),
  vehicleId: z.number().nullable(),
  scheduledDate: z.string(),
  status: tripStatusSchema,
  type: tripTypeSchema,
  source: z.enum(["roster", "adhoc"]),
  sourceId: z.string().nullable(),
  createdAt: z.string().nullable().optional(),
});

export const tripPassengerSchema = z.object({
  employeeId: z.number(),
  stopId: z.number().nullable(),
  loginTime: z.string().nullable(),
  logoutTime: z.string().nullable(),
  boardedAt: z.string().nullable(),
  droppedAt: z.string().nullable(),
});

export const tripStopSchema = z.object({
  id: z.number(),
  stopId: z.number().nullable(),
  sequence: z.number(),
  type: z.string(),
  scheduledArrival: z.string().nullable(),
  actualArrival: z.string().nullable(),
});

export const tripDetailSchema = tripSchema.extend({
  passengers: z.array(tripPassengerSchema),
  tripStops: z.array(tripStopSchema),
});

export const tripListQuerySchema = z.object({
  status: tripStatusSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cancelTripRequestSchema = z.object({
  reason: z.string().optional(),
});

export const rateTripRequestSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const tripListResponseSchema = z.object({
  items: z.array(tripSchema),
  nextCursor: z.string().optional(),
});
