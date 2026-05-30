import type { Context, Next } from "hono";
import type { AppEnv } from "../context";

const hex = () => Math.random().toString(16).slice(2, 10);

export async function requestIdMiddleware(c: Context<AppEnv>, next: Next) {
  const id = c.req.header("X-Request-ID") ?? `${hex()}-${hex()}-${hex()}`;
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  return next();
}
