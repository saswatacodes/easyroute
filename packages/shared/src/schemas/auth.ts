import { z } from "zod";
import { userRoleSchema } from "./common";

export const loginRequestSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  success: z.literal(true),
  token: z.string(),
  role: userRoleSchema,
});

export const signupRequestSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(8),
  role: userRoleSchema.exclude(["admin"]).default("employee"),
});

export const signupResponseSchema = z.object({
  success: z.literal(true),
  userId: z.string(),
});

export const forgotPasswordRequestSchema = z.object({
  employeeId: z.string().min(1),
});

export const forgotPasswordResponseSchema = z.object({
  success: z.literal(true),
  resetToken: z.string(),
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const testLoginRequestSchema = z.object({
  employeeId: z.string().min(1),
});
