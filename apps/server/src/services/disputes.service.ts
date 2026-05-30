import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { disputes, trips } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";

export async function listDisputes(
  userId: number,
  role: string,
  filters: { status?: string; limit: number; cursor?: string },
) {
  const conditions = role === "employee" ? [eq(disputes.raisedByUserId, userId)] : [];
  if (filters.status) conditions.push(eq(disputes.status, filters.status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(disputes)
    .where(where)
    .orderBy(desc(disputes.createdAt))
    .limit(filters.limit + 1);
  const items = rows.slice(0, filters.limit).map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    status: r.status as "open" | "in_review" | "resolved" | undefined,
    reason: r.reason as "pickup_issue" | "drop_issue" | "trip_quality" | "other" | undefined,
  }));
  return { items, nextCursor: rows.length > filters.limit ? String(items[items.length - 1].id) : undefined };
}

export async function createDispute(userId: number, data: { tripId: number; reason: string; description?: string }) {
  const [row] = await db
    .insert(disputes)
    .values({
      tripId: data.tripId,
      raisedByUserId: userId,
      reason: data.reason as any,
      description: data.description ?? null,
    })
    .returning();
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status as "open" | "in_review" | "resolved" | undefined,
    reason: row.reason as "pickup_issue" | "drop_issue" | "trip_quality" | "other" | undefined,
  };
}

export async function getDisputeDetail(disputeId: number, userId: number, role: string) {
  const row = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  if (!row[0]) throw new AppError(ErrorCode.NOT_FOUND, "Dispute not found");
  if (role === "employee" && row[0].raisedByUserId !== userId) {
    throw new AppError(ErrorCode.FORBIDDEN, "Access denied");
  }
  return {
    ...row[0],
    createdAt: row[0].createdAt.toISOString(),
    updatedAt: row[0].updatedAt.toISOString(),
    status: row[0].status as "open" | "in_review" | "resolved" | undefined,
    reason: row[0].reason as "pickup_issue" | "drop_issue" | "trip_quality" | "other" | undefined,
  };
}

export async function resolveDispute(disputeId: number, adminUserId: number, resolution: string) {
  const existing = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Dispute not found");
  if (existing[0].status === "resolved") throw new AppError(ErrorCode.CONFLICT, "Dispute already resolved");
  const [row] = await db
    .update(disputes)
    .set({ status: "resolved", resolutionMsg: resolution, resolvedByUserId: adminUserId })
    .where(eq(disputes.id, disputeId))
    .returning();
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status as "open" | "in_review" | "resolved" | undefined,
    reason: row.reason as "pickup_issue" | "drop_issue" | "trip_quality" | "other" | undefined,
  };
}
