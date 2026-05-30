import { boolean, geometry, index, integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const routes = pgTable(
  "routes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    description: varchar({ length: 500 }),
    startPoint: geometry("start_point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    endPoint: geometry("end_point", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("routes_start_point_idx").using("gist", t.startPoint),
    index("routes_end_point_idx").using("gist", t.endPoint),
  ],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id),
    name: varchar({ length: 255 }).notNull(),
    address: varchar({ length: 500 }),
    location: geometry({ type: "point", mode: "xy", srid: 4326 }).notNull(),
    sequence: integer().notNull(),
    estimatedMinutesFromPrev: integer("estimated_minutes_from_prev"),
    isOffice: boolean("is_office").notNull().default(false),
  },
  (t) => [
    index("route_stops_route_id_idx").on(t.routeId),
    index("route_stops_location_idx").using("gist", t.location),
  ],
);
