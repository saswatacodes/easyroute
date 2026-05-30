import { db } from "./index";
import { users, employees, drivers, shiftSchedules, routes, routeStops, trips, vehicles } from "./schema";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";

const password = process.env.SEED_ADMIN_PASSWORD;
if (!password) throw new Error("SEED_ADMIN_PASSWORD environment variable is required");

const passwordHash = await hash(password);

async function upsertUser(employeeId: string, role: "admin" | "employee" | "driver") {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.employeeId} = ${employeeId}`)
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(users)
    .values({ employeeId, passwordHash, role })
    .returning({ id: users.id });
  return row;
}

const adminUser = await upsertUser("EMP067", "admin");
const empUser = await upsertUser("EMP001", "employee");
const drvUser = await upsertUser("DRV001", "driver");

// Employee profile
const empProfile = await db
  .select({ id: employees.id })
  .from(employees)
  .where(sql`${employees.employeeCode} = 'EMP001'`)
  .limit(1);
if (!empProfile[0]) {
  await db.insert(employees).values({
    userId: empUser.id,
    name: "Alice Employee",
    email: "alice@example.com",
    phone: "555-0101",
    employeeCode: "EMP001",
  });
}

// Driver profile
const drvProfile = await db
  .select({ id: drivers.id })
  .from(drivers)
  .where(sql`${drivers.licenseNumber} = 'LIC-12345'`)
  .limit(1);
if (!drvProfile[0]) {
  await db.insert(drivers).values({
    userId: drvUser.id,
    name: "Bob Driver",
    phone: "555-0202",
    email: "bob@example.com",
    licenseNumber: "LIC-12345",
    available: true,
  });
}

// Shift schedule
const shiftRows = await db.select({ id: shiftSchedules.id }).from(shiftSchedules).limit(1);
let shiftId = shiftRows[0]?.id;
if (!shiftId) {
  const [s] = await db
    .insert(shiftSchedules)
    .values({ name: "Morning", startTime: "09:00", endTime: "17:00" })
    .returning({ id: shiftSchedules.id });
  shiftId = s.id;
}

const eveningShiftRows = await db.select({ id: shiftSchedules.id }).from(shiftSchedules).where(sql`${shiftSchedules.name} = 'Evening'`).limit(1);
if (!eveningShiftRows[0]) {
  await db.insert(shiftSchedules).values({ name: "Evening", startTime: "14:00", endTime: "22:00" }).returning({ id: shiftSchedules.id });
}

const nightShiftRows = await db.select({ id: shiftSchedules.id }).from(shiftSchedules).where(sql`${shiftSchedules.name} = 'Night'`).limit(1);
if (!nightShiftRows[0]) {
  await db.insert(shiftSchedules).values({ name: "Night", startTime: "22:00", endTime: "06:00" }).returning({ id: shiftSchedules.id });
}

// Route
const routeRows = await db.select({ id: routes.id }).from(routes).limit(1);
let routeId = routeRows[0]?.id;
if (!routeId) {
  const [r] = await db
    .insert(routes)
    .values({
      name: "Downtown Route",
      isActive: true,
      startPoint: sql`ST_SetSRID(ST_MakePoint(77.1, 28.5), 4326)`,
      endPoint: sql`ST_SetSRID(ST_MakePoint(77.2, 28.6), 4326)`,
    })
    .returning({ id: routes.id });
  routeId = r.id;
}

// Route stops + office
const stopRows = await db.select({ id: routeStops.id }).from(routeStops).where(eq(routeStops.routeId, routeId)).limit(1);
if (!stopRows[0]) {
  await db.insert(routeStops).values([
    { routeId, name: "Sector 12", location: sql`ST_SetSRID(ST_MakePoint(77.05, 28.45), 4326)`, sequence: 1, estimatedMinutesFromPrev: null, isOffice: false },
    { routeId, name: "Sector 18", location: sql`ST_SetSRID(ST_MakePoint(77.08, 28.48), 4326)`, sequence: 2, estimatedMinutesFromPrev: 10, isOffice: false },
    { routeId, name: "Sector 22", location: sql`ST_SetSRID(ST_MakePoint(77.12, 28.52), 4326)`, sequence: 3, estimatedMinutesFromPrev: 8, isOffice: false },
    { routeId, name: "Office", location: sql`ST_SetSRID(ST_MakePoint(77.2, 28.6), 4326)`, sequence: 4, estimatedMinutesFromPrev: 15, isOffice: true },
  ]);
}

// Vehicle
const vehicleRows = await db.select({ id: vehicles.id }).from(vehicles).limit(1);
if (!vehicleRows[0]) {
  await db.insert(vehicles).values({
    plateNumber: "HR-26-AB-1234",
    model: "Toyota Innova",
    capacity: 4,
    color: "White",
    isActive: true,
  });
}

console.log("Seeded: admin(EMP067), employee(EMP001), driver(DRV001)");
process.exit(0);
