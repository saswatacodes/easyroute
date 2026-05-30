import { z } from "zod";
import { tripStatusSchema } from "./trips";

export const allocateDriverRequestSchema = z.object({
  driverId: z.number(),
  vehicleId: z.number().optional(),
});

export const adminTripQuerySchema = z.object({
  status: tripStatusSchema.optional(),
  source: z.enum(["roster", "adhoc"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const resolveDisputeRequestSchema = z.object({
  resolution: z.string().min(1),
});

export const adminCreateUserRequestSchema = z.object({
  employeeId: z.string().min(1).max(50),
  password: z.string().min(6),
  role: z.enum(["employee", "driver", "admin"]),
  name: z.string().min(1).max(255),
  email: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  department: z.string().max(255).optional(),
  licenseNumber: z.string().max(100).optional(),
  vehicleId: z.number().optional(),
});

export const adminUpdateUserRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  department: z.string().max(255).optional(),
  role: z.enum(["employee", "driver", "admin"]).optional(),
  licenseNumber: z.string().max(100).optional(),
  vehicleId: z.number().optional(),
});

export const adminCreateRouteRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  isActive: z.boolean().optional(),
});

export const adminUpdateRouteRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const adminAdhocTripQuerySchema = z.object({
  status: z.enum(["requested", "allocated", "completed", "cancelled"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
