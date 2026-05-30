import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, employees, drivers, trips, tripPassengers, adhocTrips, vehicles, routes, routeStops } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { hash } from "@node-rs/argon2";
import { publishDriverEvent } from "@/lib/event-bus";

export async function adminListUsers() {
  const rows = await db
    .select({
      id: users.id,
      employeeId: users.employeeId,
      role: users.role,
      pushToken: users.pushToken,
      name: employees.name,
      email: employees.email,
      phone: employees.phone,
      department: employees.department,
      driverLicense: drivers.licenseNumber,
      driverAvailable: drivers.available,
      driverVehicleId: drivers.vehicleId,
    })
    .from(users)
    .leftJoin(employees, eq(users.id, employees.userId))
    .leftJoin(drivers, eq(users.id, drivers.userId))
    .orderBy(users.employeeId);
  return { items: rows };
}

export async function adminCreateUser(data: {
  employeeId: string; password: string; role: "employee" | "driver" | "admin";
  name: string; email?: string; phone?: string; department?: string;
  licenseNumber?: string; vehicleId?: number;
}) {
  const passwordHash = await hash(data.password);
  const [user] = await db.insert(users).values({ employeeId: data.employeeId, passwordHash, role: data.role }).returning();
  if (data.role === "employee" || data.role === "admin") {
    await db.insert(employees).values({ userId: user.id, name: data.name, email: data.email ?? null, phone: data.phone ?? null, department: data.department ?? null, employeeCode: data.employeeId });
  }
  if (data.role === "driver") {
    await db.insert(drivers).values({ userId: user.id, name: data.name, phone: data.phone ?? null, email: data.email ?? null, licenseNumber: data.licenseNumber ?? null, vehicleId: data.vehicleId ?? null });
  }
  return user;
}

export async function adminUpdateUser(userId: number, data: {
  name?: string; email?: string; phone?: string; department?: string;
  role?: string; licenseNumber?: string; vehicleId?: number;
}) {
  if (data.name !== undefined || data.email !== undefined || data.phone !== undefined || data.department !== undefined) {
    const emp = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
    if (emp[0]) {
      await db.update(employees).set({ name: data.name, email: data.email, phone: data.phone, department: data.department }).where(eq(employees.userId, userId));
    }
    const drv = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
    if (drv[0]) {
      await db.update(drivers).set({ name: data.name, phone: data.phone, email: data.email, licenseNumber: data.licenseNumber, vehicleId: data.vehicleId }).where(eq(drivers.userId, userId));
    }
  }
  if (data.role) {
    await db.update(users).set({ role: data.role as any }).where(eq(users.id, userId));
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export async function adminDeleteUser(userId: number) {
  await db.delete(drivers).where(eq(drivers.userId, userId));
  await db.delete(employees).where(eq(employees.userId, userId));
  const [row] = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "User not found");
  return row;
}

export async function adminListVehicles() {
  const rows = await db.select().from(vehicles).orderBy(vehicles.plateNumber);
  return { items: rows };
}

export async function adminCreateVehicle(data: { plateNumber: string; model?: string; capacity: number; color?: string }) {
  const [row] = await db.insert(vehicles).values(data).returning();
  return row;
}

export async function adminUpdateVehicle(id: number, data: { plateNumber?: string; model?: string; capacity?: number; color?: string; isActive?: boolean }) {
  const existing = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Vehicle not found");
  const [row] = await db.update(vehicles).set(data).where(eq(vehicles.id, id)).returning();
  return row;
}

export async function adminDeleteVehicle(id: number) {
  const [row] = await db.delete(vehicles).where(eq(vehicles.id, id)).returning({ id: vehicles.id });
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "Vehicle not found");
  return row;
}

export async function adminListRoutes() {
  const rows = await db.select().from(routes).orderBy(routes.name);
  return { items: rows };
}

export async function adminCreateRoute(data: { name: string; description?: string; startLat: number; startLng: number; endLat: number; endLng: number; isActive?: boolean }) {
  const [row] = await db
    .insert(routes)
    .values({
      name: data.name,
      description: data.description ?? null,
      startPoint: sql`ST_SetSRID(ST_MakePoint(${data.startLng}, ${data.startLat}), 4326)`,
      endPoint: sql`ST_SetSRID(ST_MakePoint(${data.endLng}, ${data.endLat}), 4326)`,
      isActive: data.isActive ?? true,
    })
    .returning();
  return row;
}

export async function adminUpdateRoute(id: number, data: { name?: string; description?: string; startLat?: number; startLng?: number; endLat?: number; endLng?: number; isActive?: boolean }) {
  const existing = await db.select().from(routes).where(eq(routes.id, id)).limit(1);
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, "Route not found");
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.startLat !== undefined && data.startLng !== undefined) {
    updates.startPoint = sql`ST_SetSRID(ST_MakePoint(${data.startLng}, ${data.startLat}), 4326)`;
  }
  if (data.endLat !== undefined && data.endLng !== undefined) {
    updates.endPoint = sql`ST_SetSRID(ST_MakePoint(${data.endLng}, ${data.endLat}), 4326)`;
  }
  const [row] = await db.update(routes).set(updates).where(eq(routes.id, id)).returning();
  return row;
}

export async function adminDeleteRoute(id: number) {
  await db.delete(routeStops).where(eq(routeStops.routeId, id));
  const [row] = await db.delete(routes).where(eq(routes.id, id)).returning({ id: routes.id });
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, "Route not found");
  return row;
}

export async function adminListTrips(filters: { status?: string; source?: string; dateFrom?: string; dateTo?: string; cursor?: string; limit: number }) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.status) conditions.push(eq(trips.status, filters.status as any));
  if (filters.source) conditions.push(eq(trips.source, filters.source as any));
  if (filters.dateFrom) conditions.push(sql`${trips.scheduledDate} >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`${trips.scheduledDate} <= ${filters.dateTo}`);
  if (filters.cursor) {
    conditions.push(sql`${trips.id} < ${Number(filters.cursor)}`);
  }
  const rows = await db
    .select({
      id: trips.id,
      routeId: trips.routeId,
      driverId: trips.driverId,
      vehicleId: trips.vehicleId,
      shiftScheduleId: trips.shiftScheduleId,
      scheduledDate: trips.scheduledDate,
      status: trips.status,
      source: trips.source,
      sourceId: trips.sourceId,
      createdAt: trips.createdAt,
    })
    .from(trips)
    .where(and(...conditions))
    .orderBy(desc(trips.createdAt), desc(trips.id))
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : undefined;
  return { items, nextCursor };
}

export async function adminAllocateTrip(tripId: number, driverId: number, vehicleId?: number) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Trip not found");
  if (trip.driverId) throw new AppError(ErrorCode.CONFLICT, "Trip already has a driver assigned");
  const [drv] = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!drv) throw new AppError(ErrorCode.NOT_FOUND, "Driver not found");
  const updates: Record<string, unknown> = { driverId };
  if (vehicleId !== undefined) updates.vehicleId = vehicleId;
  const [updated] = await db.update(trips).set(updates).where(eq(trips.id, tripId)).returning();
  publishDriverEvent(driverId, { type: "new_trip", tripId, data: updated });
  return updated;
}

export async function adminListAdhocTrips(filters: { status?: string; dateFrom?: string; dateTo?: string; cursor?: string; limit: number }) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.status) conditions.push(eq(adhocTrips.status, filters.status as any));
  if (filters.dateFrom) conditions.push(sql`${adhocTrips.scheduledDate} >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`${adhocTrips.scheduledDate} <= ${filters.dateTo}`);
  if (filters.cursor) conditions.push(sql`${adhocTrips.id} < ${Number(filters.cursor)}`);
  const rows = await db
    .select()
    .from(adhocTrips)
    .where(and(...conditions))
    .orderBy(desc(adhocTrips.createdAt))
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : undefined;
  return { items, nextCursor };
}

export async function adminAllocateAdhocTrip(adhocTripId: number, driverId: number) {
  const [trip] = await db.select().from(adhocTrips).where(eq(adhocTrips.id, adhocTripId)).limit(1);
  if (!trip) throw new AppError(ErrorCode.NOT_FOUND, "Ad-hoc trip not found");
  if (trip.status !== "requested") throw new AppError(ErrorCode.CONFLICT, "Only requested trips can be allocated");
  const [drv] = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!drv) throw new AppError(ErrorCode.NOT_FOUND, "Driver not found");
  const linkedTrip = await db.insert(trips).values({
    driverId,
    scheduledDate: trip.scheduledDate,
    status: "scheduled",
    source: "adhoc",
    sourceId: String(adhocTripId),
  }).returning();
  await db.update(adhocTrips).set({ status: "allocated", tripId: linkedTrip[0].id }).where(eq(adhocTrips.id, adhocTripId));
  publishDriverEvent(driverId, { type: "new_trip", tripId: linkedTrip[0].id, data: linkedTrip[0] });
  return linkedTrip[0];
}
