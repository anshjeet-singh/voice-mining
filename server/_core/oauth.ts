/**
 * Google sign-in routes:
 *   GET /api/auth/google     — redirect the browser to Google's consent screen
 *   GET /api/oauth/callback  — exchange the code, upsert the user, set the session cookie
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import {
  buildGoogleAuthUrl,
  createSessionToken,
  exchangeGoogleCode,
  requestOrigin,
} from "./auth";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

const STATE_COOKIE = "oauth_state";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(500).json({ error: "Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" });
      return;
    }
    const state = randomBytes(16).toString("hex");
    const redirectUri = `${requestOrigin(req)}/api/oauth/callback`;
    res.cookie(STATE_COOKIE, state, {
      ...getSessionCookieOptions(req),
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(302, buildGoogleAuthUrl(redirectUri, state));
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const expectedState = req.cookies?.[STATE_COOKIE] ?? parseStateCookie(req);

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }
    if (!state || !expectedState || state !== expectedState) {
      res.status(400).json({ error: "invalid state — please try signing in again" });
      return;
    }

    try {
      const redirectUri = `${requestOrigin(req)}/api/oauth/callback`;
      const info = await exchangeGoogleCode(code, redirectUri);
      const openId = `google_${info.sub}`;

      await db.upsertUser({
        openId,
        name: info.name || info.email || null,
        email: info.email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await createSessionToken(openId, info.name || "");
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(STATE_COOKIE, cookieOptions);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/dashboard");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "Sign-in failed. Please try again." });
    }
  });
}

/** Fallback state-cookie parser for apps without cookie-parser middleware. */
function parseStateCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STATE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
