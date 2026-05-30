import { integer, pgTable, smallint, time, varchar } from "drizzle-orm/pg-core";

export const shiftSchedules = pgTable("shift_schedules", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  daysOfWeek: smallint("days_of_week").notNull().default(62),
});
