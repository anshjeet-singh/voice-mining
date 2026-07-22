/**
 * Client-portal authentication: email + password credentials the operator
 * hands out at onboarding, JWT session cookies scoped to ONE client.
 *
 * Deliberately a separate mechanism from the owner's Google allowlist —
 * a portal session carries a clientId and can only ever read that client's
 * approved work. Passwords are scrypt-hashed (no plaintext stored); the
 * JWT is signed with the same SESSION_SECRET but a distinct cookie + claim
 * shape, so an owner cookie never passes portal auth or vice versa.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { PORTAL_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const SCRYPT_KEYLEN = 64;

function getSessionSecret(): Uint8Array {
  if (!ENV.sessionSecret) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(ENV.sessionSecret);
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hash a password for storage: "s2$<saltB64>$<hashB64>". */
export async function hashPortalPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `s2$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Timing-safe verify against a stored "s2$salt$hash" value. */
export async function verifyPortalPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "s2") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = await scryptAsync(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Generate a readable one-time password the operator emails to the client:
 * three groups from an unambiguous alphabet (no 0/O, 1/l/I).
 */
export function generatePortalPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `${group()}-${group()}-${group()}`;
}

/** Sign a portal session JWT for a login row. */
export async function createPortalSessionToken(loginId: number, clientId: number): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ portalLoginId: loginId, portalClientId: clientId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

export interface PortalSession {
  loginId: number;
  clientId: number;
}

/** Verify a portal cookie value; returns null on any failure. */
export async function verifyPortalSession(cookieValue: string | undefined | null): Promise<PortalSession | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSessionSecret(), { algorithms: ["HS256"] });
    const loginId = payload.portalLoginId;
    const clientId = payload.portalClientId;
    if (typeof loginId !== "number" || typeof clientId !== "number") return null;
    return { loginId, clientId };
  } catch {
    return null;
  }
}

/** Resolve the portal session for a request, or null. Cookie-only. */
export async function authenticatePortalRequest(req: Request): Promise<PortalSession | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifyPortalSession(cookies[PORTAL_COOKIE_NAME]);
}

// ── Login throttle: 10 failures per email or IP per 15 minutes ──────────────

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function bump(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
  // Opportunistic sweep so the map never grows unbounded.
  if (failures.size > 1000) {
    for (const [k, v] of Array.from(failures.entries())) if (v.resetAt < now) failures.delete(k);
  }
}

export function loginThrottled(email: string, ip: string): boolean {
  const now = Date.now();
  return [email.toLowerCase(), ip].some((key) => {
    const entry = failures.get(key);
    return !!entry && entry.resetAt >= now && entry.count >= MAX_FAILURES;
  });
}

export function recordLoginFailure(email: string, ip: string): void {
  bump(email.toLowerCase());
  bump(ip);
}

export function clearLoginFailures(email: string): void {
  failures.delete(email.toLowerCase());
}
