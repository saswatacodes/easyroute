import type { Context, Next } from "hono";
import type { AppEnv } from "./context";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { validateSessionToken } from "./auth";

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  if (process.env.NODE_ENV === "dev") {
    c.set("userId", "1");
    c.set("role", "admin");
    return next();
  }

  const token = getCookie(c, "session_token");
  if (token) {
    const session = await validateSessionToken(token);
    if (session) {
      c.set("userId", session.userId);
      const row = await db.select({ role: users.role }).from(users).where(eq(users.id, Number(session.userId))).limit(1);
      c.set("role", row[0]?.role ?? null);
    } else {
      c.set("userId", null);
      c.set("role", null);
    }
  } else {
    c.set("userId", null);
    c.set("role", null);
  }
  return next();
}
