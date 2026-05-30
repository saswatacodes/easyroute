import { z } from "zod";

export const vehicleSchema = z.object({
  id: z.number(),
  plateNumber: z.string(),
  model: z.string().nullable(),
  capacity: z.number(),
  color: z.string().nullable(),
  isActive: z.boolean(),
});

export const createVehicleRequestSchema = z.object({
  plateNumber: z.string().min(1).max(50),
  model: z.string().max(255).optional(),
  capacity: z.number().int().min(1),
  color: z.string().max(50).optional(),
});

export const updateVehicleRequestSchema = z.object({
  plateNumber: z.string().min(1).max(50).optional(),
  model: z.string().max(255).optional(),
  capacity: z.number().int().min(1).optional(),
  color: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});
