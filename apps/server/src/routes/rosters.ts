import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { createRosterBookingRequestSchema } from "@easyroute/shared";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { getEmployeeBookings, createBooking, cancelBooking } from "@/services/roster.service";

export const rosterRouter = new Hono<AppEnv>();

rosterRouter.get("/", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const bookings = await getEmployeeBookings(userId);
  return c.json({ items: bookings });
});

rosterRouter.post(
  "/",
  requireAuth,
  zValidator("json", createRosterBookingRequestSchema),
  async (c) => {
    const userId = Number(c.get("userId")!);
    const body = c.req.valid("json");
    const booking = await createBooking(userId, body);
    return c.json(booking, 201);
  },
);

rosterRouter.delete("/:id", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const bookingId = parseInt(c.req.param("id")!, 10);
  if (isNaN(bookingId)) throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid booking id");
  const booking = await cancelBooking(bookingId, userId);
  return c.json(booking);
});
