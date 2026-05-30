import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import { zValidator } from "@hono/zod-validator";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { verify, hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, employees, drivers } from "@/db/schema";
import { createSession, invalidateSession, createPasswordResetToken, validatePasswordResetToken, SESSION_EXPIRES_MS } from "@/lib/auth";
import { AppError, ErrorCode } from "@/lib/errors";
import { requireAuth } from "@/lib/middlewares/auth-guard";
import { requireRole } from "@/lib/middlewares/role-guard";
import {
  loginRequestSchema,
  signupRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  testLoginRequestSchema,
} from "@easyroute/shared";

export const authRouter = new Hono<AppEnv>();

authRouter.post(
  "/login",
  zValidator("json", loginRequestSchema),
  async (c) => {
    const { employeeId, password } = c.req.valid("json");
    console.log(`[Auth] Login request for employeeId: ${employeeId}`);

    const rows = await db.select().from(users).where(eq(users.employeeId, employeeId)).limit(1);
    const user = rows[0];
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid credentials");
    }

    const validPassword = await verify(user.passwordHash, password);
    if (!validPassword) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid credentials");
    }

    const token = await createSession(String(user.id));

    setCookie(c, "session_token", token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_EXPIRES_MS / 1000,
    });

    const roleRow = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
    const role = roleRow[0]?.role;

    console.log(`[Auth] Login success — employeeId: ${employeeId}, role: ${role}`);
    return c.json({ success: true as const, token, role });
  }
);

authRouter.post(
  "/test-login",
  zValidator("json", testLoginRequestSchema),
  async (c) => {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(ErrorCode.FORBIDDEN, "Not available in production");
    }

    const { employeeId } = c.req.valid("json");
    const rows = await db.select().from(users).where(eq(users.employeeId, employeeId)).limit(1);
    const user = rows[0];
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, "User not found");
    }

    const token = await createSession(String(user.id));
    return c.json({ success: true as const, token, role: user.role });
  }
);

authRouter.post(
  "/signup",
  requireAuth,
  requireRole("admin"),
  zValidator("json", signupRequestSchema),
  async (c) => {
    const { employeeId, password, role } = c.req.valid("json");
    const passwordHash = await hash(password);

    const inserted = await db.insert(users).values({ employeeId, passwordHash, role }).returning({ id: users.id, role: users.role });
    const newUser = inserted[0];

    if (newUser.role === "employee") {
      await db.insert(employees).values({
        userId: newUser.id,
        name: employeeId,
        employeeCode: employeeId,
      });
    } else if (newUser.role === "driver") {
      await db.insert(drivers).values({
        userId: newUser.id,
        name: employeeId,
      });
    }

    return c.json({ success: true as const, userId: String(newUser.id) }, 201);
  }
);

authRouter.post("/logout", async (c) => {
  const token = getCookie(c, "session_token");
  console.log(`[Auth] Logout request — token: ${token ? token.slice(0, 8) + "…" : "none"}`);
  if (token) await invalidateSession(token);
  deleteCookie(c, "session_token", { path: "/" });
  console.log(`[Auth] Logout success — token: ${token ? token.slice(0, 8) + "…" : "none"}`);
  return c.json({ success: true });
});

authRouter.post(
  "/forgot-password",
  zValidator("json", forgotPasswordRequestSchema),
  async (c) => {
    const { employeeId } = c.req.valid("json");

    const rows = await db.select().from(users).where(eq(users.employeeId, employeeId)).limit(1);
    const user = rows[0];
    if (!user) {
      return c.json({ success: true });
    }

    const token = await createPasswordResetToken(String(user.id));

    return c.json({ success: true, resetToken: token });
  }
);

authRouter.post(
  "/reset-password",
  zValidator("json", resetPasswordRequestSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");

    const result = await validatePasswordResetToken(token);
    if (!result) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid or expired reset token");
    }

    const passwordHash = await hash(password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, Number(result.userId)));

    return c.json({ success: true });
  }
);
