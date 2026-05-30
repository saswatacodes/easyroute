import { db } from "../db";
import { sessions, passwordResetTokens } from "../db/schema";
import { eq } from "drizzle-orm";

export const SESSION_EXPIRES_MS = 60 * 60 * 24 * 30 * 1000; // 30 days
const RESET_TOKEN_EXPIRES_MS = 60 * 60 * 1000; // 1 hour

function generateSecureRandomString(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

async function hashSecret(secret: string): Promise<Uint8Array> {
  const secretBytes = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  return new Uint8Array(hashBuffer);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export async function createSession(userId: string): Promise<string> {
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);
  const token = `${id}.${secret}`;
  const expiresAt = new Date(Date.now() + SESSION_EXPIRES_MS);

  await db.insert(sessions).values({ id, secretHash: toHex(secretHash), userId, expiresAt });

  return token;
}

export async function validateSessionToken(token: string): Promise<{ userId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [sessionId, sessionSecret] = parts;

  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const session = rows[0];
  if (!session) return null;

  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  const tokenSecretHash = await hashSecret(sessionSecret);
  if (!constantTimeEqual(tokenSecretHash, fromHex(session.secretHash))) return null;

  return { userId: session.userId };
}

export async function invalidateSession(token: string): Promise<void> {
  const parts = token.split(".");
  if (parts.length !== 2) return;
  await db.delete(sessions).where(eq(sessions.id, parts[0]));
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);
  const token = `${id}.${secret}`;
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MS);

  await db.insert(passwordResetTokens).values({ id, secretHash: toHex(secretHash), userId, expiresAt });

  return token;
}

export async function validatePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [tokenId, tokenSecret] = parts;

  const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId)).limit(1);
  const resetToken = rows[0];
  if (!resetToken) return null;

  if (Date.now() >= resetToken.expiresAt.getTime()) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
    return null;
  }

  const tokenSecretHash = await hashSecret(tokenSecret);
  if (!constantTimeEqual(tokenSecretHash, fromHex(resetToken.secretHash))) return null;

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
  return { userId: resetToken.userId };
}
