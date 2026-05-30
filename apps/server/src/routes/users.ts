import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, employees, drivers } from "@/db/schema";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { updateProfileRequestSchema } from "@easyroute/shared";

export const usersRouter = new Hono<AppEnv>();

usersRouter.get("/me", requireAuth, async (c) => {
  const userId = Number(c.get("userId")!);
  const role = c.get("role")!;

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, "User not found");
  }

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let employeeCode: string | undefined;
  let driverInfo: object | undefined;

  if (role === "employee") {
    const empRows = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
    if (empRows[0]) {
      name = empRows[0].name;
      email = empRows[0].email ?? null;
      phone = empRows[0].phone ?? null;
      employeeCode = empRows[0].employeeCode;
    }
  } else if (role === "driver") {
    const drvRows = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
    if (drvRows[0]) {
      name = drvRows[0].name;
      email = drvRows[0].email ?? null;
      phone = drvRows[0].phone ?? null;
      driverInfo = {
        licenseNumber: drvRows[0].licenseNumber,
        available: drvRows[0].available,
      };
    }
  }

  return c.json({
    id: user.id,
    name,
    email,
    phone,
    role,
    ...(employeeCode ? { employeeCode } : {}),
    ...(driverInfo ? { driverInfo } : {}),
  });
});

usersRouter.patch(
  "/me",
  requireAuth,
  zValidator("json", updateProfileRequestSchema),
  async (c) => {
    const userId = Number(c.get("userId")!);
    const role = c.get("role")!;
    const body = c.req.valid("json");

    if (body.push_token !== undefined) {
      await db.update(users).set({ pushToken: body.push_token }).where(eq(users.id, userId));
    }

    const profileUpdates: Record<string, string> = {};
    if (body.name !== undefined) profileUpdates.name = body.name;
    if (body.phone !== undefined) profileUpdates.phone = body.phone;

    if (Object.keys(profileUpdates).length > 0) {
      if (role === "employee") {
        await db.update(employees).set(profileUpdates).where(eq(employees.userId, userId));
      } else if (role === "driver") {
        await db.update(drivers).set(profileUpdates).where(eq(drivers.userId, userId));
      }
    }

    return c.json({ success: true as const });
  }
);
