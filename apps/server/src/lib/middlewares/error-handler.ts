import type { Context } from "hono";
import type { AppEnv } from "../context";
import { AppError, ErrorCode } from "../errors";

export function errorHandler(err: Error, c: Context<AppEnv>) {
  const requestId = c.get("requestId") ?? "unknown";

  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code, requestId }, err.status as any);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", code: ErrorCode.INTERNAL, requestId }, 500);
}
