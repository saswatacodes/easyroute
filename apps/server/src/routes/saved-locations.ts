import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { createSavedLocationRequestSchema, updateSavedLocationRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { getMySavedLocations, createSavedLocation, updateSavedLocation, deleteSavedLocation } from "@/services/saved-locations.service";

export const savedLocationsRouter = new Hono<AppEnv>();

savedLocationsRouter.get("/", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const items = await getMySavedLocations(userId);
  return c.json({ items });
});

savedLocationsRouter.post("/", requireAuth, zValidator("json", createSavedLocationRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const body = c.req.valid("json");
  const location = await createSavedLocation(userId, body);
  return c.json(location, 201);
});

savedLocationsRouter.put("/:id", requireAuth, zValidator("json", updateSavedLocationRequestSchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const locationId = parseInt(c.req.param("id")!, 10);
  if (isNaN(locationId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid location id");
  const body = c.req.valid("json");
  const location = await updateSavedLocation(userId, locationId, body);
  return c.json(location);
});

savedLocationsRouter.delete("/:id", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const locationId = parseInt(c.req.param("id")!, 10);
  if (isNaN(locationId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid location id");
  const result = await deleteSavedLocation(userId, locationId);
  return c.json({ success: true } as const);
});
