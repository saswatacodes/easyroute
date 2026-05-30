import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shiftSchedules } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";

export async function listShifts() {
  const rows = await db
    .select({ id: shiftSchedules.id, name: shiftSchedules.name, startTime: shiftSchedules.startTime, endTime: shiftSchedules.endTime })
    .from(shiftSchedules)
    .orderBy(shiftSchedules.name);
  return { items: rows };
}

export async function createShift(data: { name: string; startTime: string; endTime: string }) {
  const [row] = await db.insert(shiftSchedules).values(data).returning();
  return row;
}

export async function updateShift(id: number, data: { name?: string; startTime?: string; endTime?: string }) {
  const existing = await db.select().from(shiftSchedules).where(eq(shiftSchedules.id, id)).limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Shift not found");
  const [row] = await db.update(shiftSchedules).set(data).where(eq(shiftSchedules.id, id)).returning();
  return row;
}

export async function deleteShift(id: number) {
  const [row] = await db.delete(shiftSchedules).where(eq(shiftSchedules.id, id)).returning({ id: shiftSchedules.id });
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "Shift not found");
  return row;
}
