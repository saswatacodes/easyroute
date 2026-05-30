import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { createDisputeRequestSchema, disputeListQuerySchema, resolveDisputeRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { requireRole } from "@/lib/middlewares/role-guard";
import { listDisputes, createDispute, getDisputeDetail, resolveDispute } from "@/services/disputes.service";

export const disputesRouter = new Hono<AppEnv>();

disputesRouter.get("/", requireAuth, zValidator("query", disputeListQuerySchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const filters = c.req.valid("query");
  const result = await listDisputes(userId, role, { ...filters, limit: filters.limit ?? 20 });
  return c.json(result);
});

disputesRouter.get("/:id", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;
  const disputeId = parseInt(c.req.param("id")!, 10);
  if (isNaN(disputeId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid dispute id");
  const dispute = await getDisputeDetail(disputeId, userId, role);
  return c.json(dispute);
});

disputesRouter.post("/", requireAuth, zValidator("json", createDisputeRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const body = c.req.valid("json");
  const dispute = await createDispute(userId, body);
  return c.json(dispute, 201);
});

disputesRouter.post("/:id/resolve", requireAuth, requireRole("admin"), zValidator("json", resolveDisputeRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const disputeId = parseInt(c.req.param("id")!, 10);
  if (isNaN(disputeId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid dispute id");
  const { resolution } = c.req.valid("json");
  const dispute = await resolveDispute(disputeId, userId, resolution);
  return c.json(dispute);
});
