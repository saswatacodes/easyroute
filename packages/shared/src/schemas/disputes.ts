import { z } from "zod";

export const disputeReasonSchema = z.enum(["pickup_issue", "drop_issue", "trip_quality", "other"]);

export const disputeStatusSchema = z.enum(["open", "in_review", "resolved"]);

export const createDisputeRequestSchema = z.object({
  tripId: z.number(),
  reason: disputeReasonSchema,
  description: z.string().optional(),
});

export const disputeSchema = z.object({
  id: z.number(),
  tripId: z.number(),
  raisedByUserId: z.number(),
  reason: disputeReasonSchema,
  description: z.string().nullable(),
  status: disputeStatusSchema,
  resolutionMsg: z.string().nullable(),
  resolvedByUserId: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const disputeListQuerySchema = z.object({
  status: disputeStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const disputeListResponseSchema = z.object({
  items: z.array(disputeSchema),
  nextCursor: z.string().optional(),
});
