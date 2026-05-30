import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { cors } from "hono/cors";
import { sessionMiddleware } from "@/lib/session-middleware";
import { requestIdMiddleware } from "@/lib/middlewares/request-id";
import { errorHandler } from "@/lib/middlewares/error-handler";
import { createBunWebSocket } from "hono/bun";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers, locationPings } from "@/db/schema";
import { validateSessionToken } from "@/lib/auth";
import { subscribeTrip, publishTripEvent } from "@/lib/event-bus";
import { startCronJobs } from "@/lib/cron";
import { authRouter } from "@/routes/auth";
import { usersRouter } from "@/routes/users";
import { routesRouter } from "@/routes/routes";
import { rosterRouter } from "@/routes/rosters";
import { tripsRouter } from "@/routes/trips";
import { adminRouter } from "@/routes/admin";
import { stopsRouter } from "@/routes/stops";
import { driverRouter } from "@/routes/driver";
import { savedLocationsRouter } from "@/routes/saved-locations";
import { shiftsRouter } from "@/routes/shifts";
import { adhocRouter } from "@/routes/adhoc";
import { disputesRouter } from "@/routes/disputes";
import { notificationsRouter } from "@/routes/notifications";
import { sseRouter } from "@/routes/sse";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono<AppEnv>();

app.use("/*", requestIdMiddleware);
app.onError(errorHandler);

app.use("/*", cors(
  process.env.NODE_ENV === "production"
    ? { origin: process.env.ALLOWED_ORIGIN, credentials: true }
    : {}
));
app.use("/*", sessionMiddleware);

app.get("/ws", upgradeWebSocket(() => {
  let userId: number | null = null;
  const cleanup = new Map<number, () => void>();

  return {
    onOpen(_event, ws) {
      ws.send(JSON.stringify({ type: "connected" }));
    },

    async onMessage(event, ws) {
      try {
        const msg = JSON.parse(event.data.toString());

        if (msg.type === "auth") {
          const session = await validateSessionToken(msg.token);
          if (!session) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            ws.close();
            return;
          }
          userId = Number(session.userId);
          ws.send(JSON.stringify({ type: "authenticated", userId }));
          return;
        }

        if (!userId) {
          ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
          return;
        }

        if (msg.type === "subscribe_trip") {
          const unsub = subscribeTrip(msg.tripId, (event) => {
            try { ws.send(JSON.stringify(event)); } catch {}
          });
          cleanup.set(msg.tripId, unsub);
          ws.send(JSON.stringify({ type: "subscribed", tripId: msg.tripId }));
          return;
        }

        if (msg.type === "location") {
          const { tripId, lat, lng } = msg;
          if (!tripId || lat == null || lng == null) {
            ws.send(JSON.stringify({ type: "error", message: "Missing tripId, lat, or lng" }));
            return;
          }

          const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
          if (!row) {
            ws.send(JSON.stringify({ type: "error", message: "Driver profile not found" }));
            return;
          }

          const driverId = row.id;
          await db.insert(locationPings).values({ driverId, tripId, lat, lng });

          publishTripEvent(tripId, {
            type: "location_update",
            tripId,
            driverId,
            lat,
            lng,
            timestamp: new Date().toISOString(),
          });

          ws.send(JSON.stringify({ type: "location_ack", tripId }));
          return;
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    },

    onClose() {
      for (const [, unsub] of cleanup) {
        unsub();
      }
    },
  };
}));

app.route("/auth", authRouter);
app.route("/users", usersRouter);
app.route("/routes", routesRouter);
app.route("/roster-bookings", rosterRouter);
app.route("/trips", tripsRouter);
app.route("/admin", adminRouter);
app.route("/stops", stopsRouter);
app.route("/driver", driverRouter);
app.route("/saved-locations", savedLocationsRouter);
app.route("/shifts", shiftsRouter);
app.route("/adhoc-trips", adhocRouter);
app.route("/disputes", disputesRouter);
app.route("/notifications", notificationsRouter);
app.route("/sse", sseRouter);

app.get("/health", (c) => c.json({ status: "ok" }));

startCronJobs();

export { websocket };
export default app;
