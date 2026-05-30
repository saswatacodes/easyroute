import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["employee", "driver", "admin"]);

export const tripStatusEnum = pgEnum("trip_status", [
  "scheduled",
  "en_route",
  "at_pickup",
  "ongoing",
  "completed",
  "cancelled",
]);

export const adhocTripStatusEnum = pgEnum("adhoc_trip_status", [
  "requested",
  "allocated",
  "completed",
  "cancelled",
]);

export const rosterTripStatusEnum = pgEnum("roster_trip_status", [
  "scheduled",
  "ongoing",
  "cancelled",
]);

export const savedLocationTypeEnum = pgEnum("saved_location_type", [
  "home",
  "work",
  "other",
]);

export const disputeReasonEnum = pgEnum("dispute_reason", [
  "pickup_issue",
  "drop_issue",
  "trip_quality",
  "other",
]);

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "in_review",
  "resolved",
]);

export const tripSourceEnum = pgEnum("trip_source", ["roster", "adhoc"]);

export const tripTypeEnum = pgEnum("trip_type", ["login_trip", "logout_trip"]);
