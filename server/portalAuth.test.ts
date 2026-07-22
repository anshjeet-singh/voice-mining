import { beforeAll, describe, expect, it } from "vitest";
import {
  clearLoginFailures,
  generatePortalPassword,
  hashPortalPassword,
  loginThrottled,
  recordLoginFailure,
  verifyPortalPassword,
} from "./portalAuth";

beforeAll(() => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
});

describe("portal passwords", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPortalPassword("kd3m-p7xq-8vn2");
    expect(hash.startsWith("s2$")).toBe(true);
    expect(await verifyPortalPassword("kd3m-p7xq-8vn2", hash)).toBe(true);
  });

  it("rejects a wrong password and malformed hashes", async () => {
    const hash = await hashPortalPassword("right-one-here");
    expect(await verifyPortalPassword("wrong-one-here", hash)).toBe(false);
    expect(await verifyPortalPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPortalPassword("anything", "s2$bad")).toBe(false);
  });

  it("salts every hash (same password, different hash)", async () => {
    const a = await hashPortalPassword("same-pass-word");
    const b = await hashPortalPassword("same-pass-word");
    expect(a).not.toBe(b);
  });

  it("generates readable three-group passwords from the unambiguous alphabet", () => {
    const pw = generatePortalPassword();
    expect(pw).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(pw).not.toMatch(/[01loi]/);
    expect(generatePortalPassword()).not.toBe(pw);
  });
});

describe("login throttle", () => {
  it("locks an email after 10 failures and clears on success", () => {
    const email = "throttle-me@example.com";
    const ip = "203.0.113.9";
    expect(loginThrottled(email, ip)).toBe(false);
    for (let i = 0; i < 10; i++) recordLoginFailure(email, ip);
    expect(loginThrottled(email, ip)).toBe(true);
    // The IP is locked too — a different email from the same IP is throttled.
    expect(loginThrottled("other@example.com", ip)).toBe(true);
    clearLoginFailures(email);
    // Email cleared, but the IP counter stays — throttle still holds by IP.
    expect(loginThrottled(email, "198.51.100.1")).toBe(false);
    expect(loginThrottled(email, ip)).toBe(true);
  });
});
