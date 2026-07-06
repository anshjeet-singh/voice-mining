/**
 * Self-owned authentication: Google OAuth 2.0 sign-in + JWT session cookies.
 * No third-party auth service — sessions are signed with SESSION_SECRET and
 * users live in our own `users` table (openId = "google_<sub>").
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getSessionSecret(): Uint8Array {
  if (!ENV.sessionSecret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.sessionSecret);
}

/** The app's public origin for a request, honouring reverse-proxy headers. */
export function requestOrigin(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto
    ? String(Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto).split(",")[0].trim()
    : req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

/** URL to send the user to for Google sign-in. */
export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", ENV.googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
}

/** Exchange an authorization code for the Google user's identity. */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<GoogleUserInfo> {
  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResp.ok) {
    const detail = await tokenResp.text().catch(() => "");
    throw new Error(`Google token exchange failed (${tokenResp.status}): ${detail}`);
  }
  const tokens = (await tokenResp.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }

  const userResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResp.ok) {
    throw new Error(`Google userinfo failed (${userResp.status})`);
  }
  const info = (await userResp.json()) as GoogleUserInfo;
  if (!info.sub) {
    throw new Error("Google userinfo returned no subject");
  }
  return info;
}

/** Sign a session JWT for a user. */
export async function createSessionToken(openId: string, name: string): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

/** Verify a session cookie value; returns null on any failure. */
export async function verifySession(
  cookieValue: string | undefined | null
): Promise<{ openId: string; name: string } | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSessionSecret(), {
      algorithms: ["HS256"],
    });
    const openId = payload.openId;
    if (typeof openId !== "string" || openId.length === 0) return null;
    return { openId, name: typeof payload.name === "string" ? payload.name : "" };
  } catch {
    return null;
  }
}

/** Resolve the signed-in user for a request, or null. */
export async function authenticateRequest(req: Request): Promise<User | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const session = await verifySession(cookies[COOKIE_NAME]);
  if (!session) return null;
  const user = await db.getUserByOpenId(session.openId);
  return user ?? null;
}
