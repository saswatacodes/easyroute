import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, employees, tripPassengers } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";

export async function notifyUser(userId: number, title: string, body: string) {
  await db.insert(notifications).values({ userId, title, body });
}

export async function notifyTripPassengers(tripId: number, title: string, body: string) {
  const rows = await db
    .select({ userId: employees.userId })
    .from(tripPassengers)
    .innerJoin(employees, eq(tripPassengers.employeeId, employees.id))
    .where(eq(tripPassengers.tripId, tripId));
  for (const row of rows) {
    await db.insert(notifications).values({ userId: row.userId, title, body });
  }
}

export async function listNotifications(userId: number, cursor?: string, limit = 20) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.deletedAt)];
  if (cursor) conditions.push(sql`${notifications.id} < ${Number(cursor)}`);
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(sql`${notifications.isRead} ASC`, desc(notifications.createdAt))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    items,
    nextCursor: rows.length > limit ? String(items[items.length - 1].id) : undefined,
  };
}

export async function markNotificationAsRead(userId: number, notificationId: number) {
  const existing = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), isNull(notifications.deletedAt)))
    .limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Notification not found");
  if (existing[0].userId !== userId) throw new AppError(ErrorCode.FORBIDDEN, "Access denied");
  const [row] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId))
    .returning();
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function markAllNotificationsAsRead(userId: number) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return { success: true as const };
}
