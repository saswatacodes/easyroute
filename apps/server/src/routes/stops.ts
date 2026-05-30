import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAuth } from "@/lib/middlewares/auth-guard";

export const stopsRouter = new Hono<AppEnv>();

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

stopsRouter.get("/nearby", requireAuth, zValidator("query", nearbyQuerySchema), async (c) => {
  const { lat, lng, limit } = c.req.valid("query");

  const rows = await db.execute<{
    id: number;
    name: string;
    address: string | null;
    route_id: number;
    route_name: string;
    sequence: number;
    distance: number;
  }>(sql`
    SELECT
      rs.id,
      rs.name,
      rs.address,
      rs.route_id,
      r.name AS route_name,
      rs.sequence,
      rs.location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS distance
    FROM route_stops rs
    JOIN routes r ON r.id = rs.route_id
    WHERE r.is_active = true
    ORDER BY rs.location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
    LIMIT ${limit}
  `);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      routeId: r.route_id,
      routeName: r.route_name,
      sequence: r.sequence,
      distance: Number(r.distance),
    })),
  );
});
