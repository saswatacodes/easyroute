import { geometry, index, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { employees } from "./users";
import { savedLocationTypeEnum } from "./enums";

export const savedLocations = pgTable(
  "saved_locations",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .references(() => employees.id),
    name: varchar({ length: 255 }).notNull(),
    address: varchar({ length: 500 }),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    type: savedLocationTypeEnum().notNull().default("other"),
  },
  (t) => [
    index("saved_locations_employee_id_idx").on(t.employeeId),
    index("saved_locations_location_idx").using("gist", t.location),
  ],
);
