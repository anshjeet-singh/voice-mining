import { describe, expect, it } from "vitest";
import { FOUNDATION_DOC_TITLES, isWorkerAuthorized } from "./workerRoutes";

describe("worker auth", () => {
  it("rejects when secret is not configured", () => {
    expect(isWorkerAuthorized("Bearer anything", "")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isWorkerAuthorized(undefined, "s3cret")).toBe(false);
  });

  it("rejects the wrong token", () => {
    expect(isWorkerAuthorized("Bearer wrong", "s3cret")).toBe(false);
  });

  it("accepts the exact bearer token", () => {
    expect(isWorkerAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });
});

describe("foundation doc contract", () => {
  it("defines the four mother-skill docs in order", () => {
    expect(Object.keys(FOUNDATION_DOC_TITLES)).toEqual([
      "icp_snapshot",
      "offers",
      "brand_positioning",
      "course_outline",
    ]);
  });
});
