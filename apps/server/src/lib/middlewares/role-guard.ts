import type { Context, Next } from "hono";
import type { AppEnv } from "../context";
import { AppError, ErrorCode } from "../errors";

export function requireRole(...roles: Array<"admin" | "driver" | "employee">) {
  return async function (c: Context<AppEnv>, next: Next) {
    const role = c.get("role");
    if (!role || !roles.includes(role)) {
      throw new AppError(ErrorCode.FORBIDDEN, `Requires one of: ${roles.join(", ")}`);
    }
    return next();
  };
}
