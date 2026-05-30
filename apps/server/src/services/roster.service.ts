import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rosterBookings } from "@/db/schema";
import { employees } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";

export interface CreateRosterBookingData {
  pickupStopId: number;
  dropoffStopId: number;
  pickupLocationId?: number;
  dropoffLocationId?: number;
  shiftScheduleId: number;
  daysOfWeek: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}

async function getEmployeeId(userId: number): Promise<number> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "Employee profile not found");
  return row.id;
}

export async function getEmployeeBookings(userId: number) {
  const employeeId = await getEmployeeId(userId);
  return db
    .select()
    .from(rosterBookings)
    .where(eq(rosterBookings.employeeId, employeeId))
    .orderBy(sql`${rosterBookings.effectiveFrom} DESC`);
}

export async function createBooking(userId: number, data: CreateRosterBookingData) {
  const employeeId = await getEmployeeId(userId);
  const effectiveUntil = data.effectiveUntil ?? null;

  const [conflict] = await db
    .select({ id: rosterBookings.id })
    .from(rosterBookings)
    .where(
      and(
        eq(rosterBookings.employeeId, employeeId),
        eq(rosterBookings.shiftScheduleId, data.shiftScheduleId),
        ne(rosterBookings.status, "cancelled"),
        sql`${data.effectiveFrom}::date <= COALESCE(${rosterBookings.effectiveUntil}, '9999-12-31')`,
        sql`COALESCE(${effectiveUntil}::date, '9999-12-31') >= ${rosterBookings.effectiveFrom}`,
      ),
    )
    .limit(1);

  if (conflict) {
    throw new AppError(ErrorCode.CONFLICT, "Overlapping roster booking exists for this shift and date range");
  }

  const [booking] = await db
    .insert(rosterBookings)
    .values({
      employeeId,
      pickupStopId: data.pickupStopId,
      dropoffStopId: data.dropoffStopId,
      pickupLocationId: data.pickupLocationId ?? null,
      dropoffLocationId: data.dropoffLocationId ?? null,
      shiftScheduleId: data.shiftScheduleId,
      daysOfWeek: data.daysOfWeek,
      effectiveFrom: data.effectiveFrom,
      effectiveUntil,
    })
    .returning();

  return booking;
}

export async function cancelBooking(bookingId: number, userId: number) {
  const employeeId = await getEmployeeId(userId);

  const [booking] = await db
    .select()
    .from(rosterBookings)
    .where(eq(rosterBookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new AppError(ErrorCode.NOT_FOUND, "Roster booking not found");
  }

  if (booking.employeeId !== employeeId) {
    throw new AppError(ErrorCode.FORBIDDEN, "Cannot cancel another employee's booking");
  }

  if (booking.status === "cancelled") {
    throw new AppError(ErrorCode.CONFLICT, "Booking is already cancelled");
  }

  const [cancelled] = await db
    .update(rosterBookings)
    .set({ status: "cancelled" })
    .where(eq(rosterBookings.id, bookingId))
    .returning();

  return cancelled;
}
