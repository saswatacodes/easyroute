import { date, index, integer, pgTable, smallint, uuid } from "drizzle-orm/pg-core";
import { employees } from "./users";
import { routes, routeStops } from "./routes";
import { shiftSchedules } from "./shifts";
import { rosterTripStatusEnum } from "./enums";
import { savedLocations } from "./saved_locations";

export const rosterBookings = pgTable(
  "roster_bookings",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    pickupLocationId: integer("pickup_location_id").references(() => savedLocations.id),
    dropoffLocationId: integer("dropoff_location_id").references(() => savedLocations.id),
    pickupStopId: integer("pickup_stop_id").references(() => routeStops.id),
    dropoffStopId: integer("dropoff_stop_id").references(() => routeStops.id),
    shiftScheduleId: integer("shift_schedule_id")
      .notNull()
      .references(() => shiftSchedules.id),
    // Bitmask: bit 0 = Monday, bit 1 = Tuesday, ..., bit 6 = Sunday (ISO 8601 order)
    daysOfWeek: smallint("days_of_week").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),
    status: rosterTripStatusEnum().notNull().default("scheduled"),
    rosterId: uuid("roster_id").references(() => rosters.id),
  },
  (t) => [
    index("roster_bookings_employee_id_idx").on(t.employeeId),
    index("roster_bookings_status_idx").on(t.status),
  ],
);

export const rosters = pgTable(
  "rosters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: integer("route_id").notNull().references(() => routes.id),
    shiftScheduleId: integer("shift_schedule_id").notNull().references(() => shiftSchedules.id),
    scheduledDate: date("scheduled_date").notNull(),
    status: rosterTripStatusEnum().notNull().default("scheduled"),
  },
  (t) => [
    index("rosters_route_id_idx").on(t.routeId),
    index("rosters_shift_schedule_id_idx").on(t.shiftScheduleId),
    index("rosters_scheduled_date_idx").on(t.scheduledDate),
    index("rosters_status_idx").on(t.status),
  ],
)
