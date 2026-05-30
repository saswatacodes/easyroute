import type { Env } from "hono";

export interface AppEnv extends Env {
  Variables: {
    userId: string | null;
    role: "employee" | "driver" | "admin" | null;
    requestId: string;
  };
}
