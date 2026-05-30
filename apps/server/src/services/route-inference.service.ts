import { eq } from "drizzle-orm";
import { db } from "@/db";
import { routeStops } from "@/db/schema";

export interface InferredRoute {
  routeId: number;
}

export async function inferRouteFromStops(
  pickupStopId: number | null,
  dropoffStopId: number | null,
): Promise<InferredRoute | null> {
  if (!pickupStopId || !dropoffStopId) return null;

  const rows = await db
    .select({ routeId: routeStops.routeId, sequence: routeStops.sequence })
    .from(routeStops)
    .where(eq(routeStops.id, pickupStopId))
    .limit(1);

  const pickup = rows[0];
  if (!pickup) return null;

  const dropoffRows = await db
    .select({ routeId: routeStops.routeId, sequence: routeStops.sequence })
    .from(routeStops)
    .where(eq(routeStops.id, dropoffStopId))
    .limit(1);

  const dropoff = dropoffRows[0];
  if (!dropoff) return null;

  if (pickup.routeId !== dropoff.routeId) return null;
  if (pickup.sequence >= dropoff.sequence) return null;

  return { routeId: pickup.routeId };
}
