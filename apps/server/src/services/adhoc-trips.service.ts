import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { employees, adhocTrips } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function listAdhocTrips(
  userId: number,
  role: string,
  filters: { status?: string; limit: number; cursor?: string },
) {
  const conditions = [];
  if (role === "employee") {
    const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
    if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
    conditions.push(eq(adhocTrips.employeeId, emp[0].id));
  }
  if (filters.status) conditions.push(eq(adhocTrips.status, filters.status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: adhocTrips.id,
      employeeId: adhocTrips.employeeId,
      tripId: adhocTrips.tripId,
      pickupLocation: adhocTrips.pickupLocation,
      dropoffLocation: adhocTrips.dropoffLocation,
      scheduledDate: adhocTrips.scheduledDate,
      scheduledTime: adhocTrips.scheduledTime,
      status: adhocTrips.status,
    })
    .from(adhocTrips)
    .where(where)
    .orderBy(desc(adhocTrips.scheduledDate))
    .limit(filters.limit + 1);
  const items = rows.slice(0, filters.limit).map((r) => ({
    ...r,
    pickupLocation: r.pickupLocation as { x: number; y: number },
    dropoffLocation: r.dropoffLocation as { x: number; y: number },
    status: r.status as "requested" | "allocated" | "completed" | "cancelled",
  }));
  return { items, nextCursor: rows.length > filters.limit ? String(items[items.length - 1].id) : undefined };
}

export async function getAdhocTripDetail(userId: number, role: string, tripId: number) {
  const row = await db
    .select({
      id: adhocTrips.id,
      employeeId: adhocTrips.employeeId,
      tripId: adhocTrips.tripId,
      pickupLocation: adhocTrips.pickupLocation,
      dropoffLocation: adhocTrips.dropoffLocation,
      scheduledDate: adhocTrips.scheduledDate,
      scheduledTime: adhocTrips.scheduledTime,
      status: adhocTrips.status,
    })
    .from(adhocTrips)
    .where(eq(adhocTrips.id, tripId))
    .limit(1);
  if (!row[0]) throw new AppError(ErrorCode.NOT_FOUND, "Ad-hoc trip not found");
  if (role === "employee") {
    const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
    if (!emp[0] || emp[0].id !== row[0].employeeId) throw new AppError(ErrorCode.FORBIDDEN, "Access denied");
  }
  return {
    ...row[0],
    pickupLocation: row[0].pickupLocation as { x: number; y: number },
    dropoffLocation: row[0].dropoffLocation as { x: number; y: number },
    status: row[0].status as "requested" | "allocated" | "completed" | "cancelled",
  };
}

export async function createAdhocTrip(
  userId: number,
  data: { pickupLocation: { lat: number; lng: number }; dropoffLocation: { lat: number; lng: number }; scheduledDate: string; scheduledTime: string },
) {
  const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
  if (!emp[0]) throw new AppError(ErrorCode.FORBIDDEN, "Employee profile not found");
  const loginOtp = generateOtp();
  const logoutOtp = generateOtp();
  const loginOtpHash = await hash(loginOtp);
  const logoutOtpHash = await hash(logoutOtp);
  const [row] = await db
    .insert(adhocTrips)
    .values({
      employeeId: emp[0].id,
      pickupLocation: sql`ST_SetSRID(ST_MakePoint(${data.pickupLocation.lng}, ${data.pickupLocation.lat}), 4326)`,
      dropoffLocation: sql`ST_SetSRID(ST_MakePoint(${data.dropoffLocation.lng}, ${data.dropoffLocation.lat}), 4326)`,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      loginOtpHash,
      logoutOtpHash,
    })
    .returning({
      id: adhocTrips.id,
      employeeId: adhocTrips.employeeId,
      tripId: adhocTrips.tripId,
      pickupLocation: adhocTrips.pickupLocation,
      dropoffLocation: adhocTrips.dropoffLocation,
      scheduledDate: adhocTrips.scheduledDate,
      scheduledTime: adhocTrips.scheduledTime,
      status: adhocTrips.status,
    });
  return {
    ...row,
    pickupLocation: row.pickupLocation as { x: number; y: number },
    dropoffLocation: row.dropoffLocation as { x: number; y: number },
    status: row.status as "requested" | "allocated" | "completed" | "cancelled",
    loginOtp,
    logoutOtp,
  };
}

export async function cancelAdhocTrip(userId: number, role: string, tripId: number) {
  const trip = await getAdhocTripDetail(userId, role, tripId);
  if (trip.status === "completed" || trip.status === "cancelled") {
    throw new AppError(ErrorCode.CONFLICT, "Cannot cancel a completed or already cancelled trip");
  }
  await db.update(adhocTrips).set({ status: "cancelled" }).where(eq(adhocTrips.id, tripId));
  return { ...trip, status: "cancelled" as const };
}

export async function verifyAdhocOtp(userId: number, role: string, adhocTripId: number, otp: string, otpType: "login" | "logout") {
  const trip = await getAdhocTripDetail(userId, role, adhocTripId);
  const hashField = otpType === "login" ? trip.loginOtpHash : trip.logoutOtpHash;
  const valid = await verify(hashField, otp);
  if (!valid) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid OTP");
  return { success: true as const };
}
