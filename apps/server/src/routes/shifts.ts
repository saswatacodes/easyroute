import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { createShiftRequestSchema, updateShiftRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { requireRole } from "@/lib/middlewares/role-guard";
import { listShifts, createShift, updateShift, deleteShift } from "@/services/shifts.service";

export const shiftsRouter = new Hono<AppEnv>();

shiftsRouter.get("/", async (c) => {
  const result = await listShifts();
  return c.json(result);
});

shiftsRouter.post("/", requireAuth, requireRole("admin"), zValidator("json", createShiftRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const shift = await createShift(body);
  return c.json(shift, 201);
});

shiftsRouter.put("/:id", requireAuth, requireRole("admin"), zValidator("json", updateShiftRequestSchema), async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid shift id");
  const body = c.req.valid("json");
  const shift = await updateShift(id, body);
  return c.json(shift);
});

shiftsRouter.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const id = parseInt(c.req.param("id")!, 10);
  if (isNaN(id)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid shift id");
  const result = await deleteShift(id);
  return c.json({ success: true } as const);
});
