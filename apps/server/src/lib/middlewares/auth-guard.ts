import type { Context, Next } from "hono";
import type { AppEnv } from "../context";
import { AppError, ErrorCode } from "../errors";

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const userId = c.get("userId");
  if (!userId) {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Authentication required");
  }
  return next();
}
