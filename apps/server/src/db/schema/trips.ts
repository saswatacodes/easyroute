import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { tripStatusEnum, tripSourceEnum, tripTypeEnum } from "./enums";
import { routes, routeStops } from "./routes";
import { shiftSchedules } from "./shifts";
import { employees, drivers, users } from "./users";
import { vehicles } from "./vehicles";

export const trips = pgTable(
  "trips",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    routeId: integer("route_id").references(() => routes.id),
    driverId: integer("driver_id").references(() => drivers.id),
    vehicleId: integer("vehicle_id").references(() => vehicles.id),
    shiftScheduleId: integer("shift_schedule_id").references(() => shiftSchedules.id),
    scheduledDate: date("scheduled_date").notNull(),
    status: tripStatusEnum().notNull().default("scheduled"),
    type: tripTypeEnum("type").notNull(),
    source: tripSourceEnum().notNull(),
    sourceId: varchar("source_id", { length: 36 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
    cancelledBy: integer("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    index("trips_driver_id_idx").on(t.driverId),
    index("trips_scheduled_date_idx").on(t.scheduledDate),
    index("trips_status_idx").on(t.status),
    index("trips_type_idx").on(t.type),
    index("trips_source_idx").on(t.source),
    index("trips_source_source_id_idx").on(t.source, t.sourceId),
    index("trips_cancelled_by_idx").on(t.cancelledBy),
  ],
);

export const tripPassengers = pgTable(
  "trip_passengers",
  {
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    stopId: integer("stop_id").references(() => routeStops.id),
    loginTime: time("login_time"),
    logoutTime: time("logout_time"),
    boardedAt: timestamp("boarded_at", { mode: "date" }),
    droppedAt: timestamp("dropped_at", { mode: "date" }),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.employeeId] }),
    index("trip_passengers_employee_id_idx").on(t.employeeId),
  ],
);

export const tripStops = pgTable(
  "trip_stops",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id),
    stopId: integer("stop_id").references(() => routeStops.id),
    sequence: integer().notNull(),
    type: varchar("type", { length: 10 }).notNull(),
    scheduledArrival: time("scheduled_arrival"),
    actualArrival: timestamp("actual_arrival", { mode: "date" }),
  },
  (t) => [
    index("trip_stops_trip_id_idx").on(t.tripId),
    index("trip_stops_trip_id_sequence_idx").on(t.tripId, t.sequence),
  ],
);
