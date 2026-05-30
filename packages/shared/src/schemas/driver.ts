import { z } from "zod";
import { tripStatusSchema } from "./trips";

export const updateAvailabilityRequestSchema = z.object({
  available: z.boolean(),
});

export const stageTripRequestSchema = z.object({
  stage: z.enum(["started", "completed"]),
});

export const locationPingRequestSchema = z.object({
  tripId: z.number(),
  lat: z.number(),
  lng: z.number(),
});

export const locationPingResponseSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  timestamp: z.string(),
});

export const driverLocationSchema = z.object({
  driverId: z.number(),
  lat: z.number(),
  lng: z.number(),
  timestamp: z.string(),
  tripId: z.number().nullable(),
});

export const driverTripQuerySchema = z.object({
  date: z.string().optional(),
  status: tripStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateTripStatusSchema = z.object({
  status: tripStatusSchema,
});

export const driverTripItemSchema = z.object({
  id: z.number(),
  routeId: z.number().nullable(),
  driverId: z.number().nullable(),
  vehicleId: z.number().nullable(),
  scheduledDate: z.string(),
  status: tripStatusSchema,
  source: z.enum(["roster", "adhoc"]),
  passengerCount: z.number(),
  boardedCount: z.number(),
  droppedCount: z.number(),
});
