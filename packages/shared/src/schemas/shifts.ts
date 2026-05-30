import { z } from "zod";

export const createShiftRequestSchema = z.object({
  name: z.string().min(1).max(255),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const updateShiftRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const shiftSchema = z.object({
  id: z.number(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export const shiftListResponseSchema = z.object({
  items: z.array(shiftSchema),
});
