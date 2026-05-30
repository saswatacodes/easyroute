import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { employees, savedLocations } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { sql } from "drizzle-orm";

export async function getMySavedLocations(userId: number) {
  const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
  const rows = await db
    .select({
      id: savedLocations.id,
      employeeId: savedLocations.employeeId,
      name: savedLocations.name,
      address: savedLocations.address,
      location: savedLocations.location,
      type: savedLocations.type,
    })
    .from(savedLocations)
    .where(eq(savedLocations.employeeId, emp[0].id))
    .orderBy(savedLocations.name);
  return rows.map((r) => ({
    ...r,
    location: r.location as { x: number; y: number },
    type: r.type as "home" | "work" | "other",
  }));
}

export async function createSavedLocation(
  userId: number,
  data: { name: string; address?: string; lat: number; lng: number; type?: "home" | "work" | "other" },
) {
  const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
  const [row] = await db
    .insert(savedLocations)
    .values({
      employeeId: emp[0].id,
      name: data.name,
      address: data.address ?? null,
      location: sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)`,
      type: data.type ?? "other",
    })
    .returning();
  return { ...row, location: row.location as { x: number; y: number }, type: row.type as "home" | "work" | "other" };
}

export async function updateSavedLocation(
  userId: number,
  locationId: number,
  data: { name?: string; address?: string; lat?: number; lng?: number; type?: "home" | "work" | "other" },
) {
  const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
  const existing = await db
    .select()
    .from(savedLocations)
    .where(and(eq(savedLocations.id, locationId), eq(savedLocations.employeeId, emp[0].id)))
    .limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Saved location not found");
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.address !== undefined) updates.address = data.address;
  if (data.type !== undefined) updates.type = data.type;
  if (data.lat !== undefined && data.lng !== undefined) {
    updates.location = sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)`;
  }
  if (Object.keys(updates).length === 0) return existing[0];
  const [row] = await db
    .update(savedLocations)
    .set(updates)
    .where(and(eq(savedLocations.id, locationId), eq(savedLocations.employeeId, emp[0].id)))
    .returning();
  return { ...row, location: row.location as { x: number; y: number }, type: row.type as "home" | "work" | "other" };
}

export async function deleteSavedLocation(userId: number, locationId: number) {
  const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
  const [row] = await db
    .delete(savedLocations)
    .where(and(eq(savedLocations.id, locationId), eq(savedLocations.employeeId, emp[0].id)))
    .returning({ id: savedLocations.id });
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "Saved location not found");
  return row;
}
