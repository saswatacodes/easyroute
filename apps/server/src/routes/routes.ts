import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { routes, routeStops } from "@/db/schema";

export const routesRouter = new Hono<AppEnv>();

routesRouter.get("/", async (c) => {
  const offset = Math.max(parseInt(c.req.query("offset") || "0", 10), 0);
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10), 1), 100);

  const data = await db
    .select({ id: routes.id, name: routes.name, startPoint: routes.startPoint, endPoint: routes.endPoint })
    .from(routes)
    .where(eq(routes.isActive, true))
    .orderBy(asc(routes.name))
    .offset(offset)
    .limit(limit);

  const total = await db
    .select({ count: count() })
    .from(routes)
    .where(eq(routes.isActive, true))
    .then((r) => r[0].count);

  c.header("Cache-Control", "max-age=300");
  return c.json({ data, pagination: { offset, limit, total } });
});

routesRouter.get("/:id/stops", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  const data = await db
    .select({ id: routeStops.id, name: routeStops.name, location: routeStops.location, sequence: routeStops.sequence })
    .from(routeStops)
    .where(eq(routeStops.routeId, id))
    .orderBy(asc(routeStops.sequence));

  c.header("Cache-Control", "max-age=300");
  return c.json(data);
});
