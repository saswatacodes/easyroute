import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { notificationListQuerySchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/services/notifications.service";

export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.get("/", requireAuth, zValidator("query", notificationListQuerySchema), async (c) => {
  const userId = Number(c.get("userId")!);
  const { cursor, limit } = c.req.valid("query");
  const result = await listNotifications(userId, cursor, limit ?? 20);
  return c.json(result);
});

notificationsRouter.patch("/read-all", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const result = await markAllNotificationsAsRead(userId);
  return c.json(result);
});

notificationsRouter.patch("/:id/read", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const notificationId = parseInt(c.req.param("id")!, 10);
  if (isNaN(notificationId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid notification id");
  const notification = await markNotificationAsRead(userId, notificationId);
  return c.json(notification);
});
