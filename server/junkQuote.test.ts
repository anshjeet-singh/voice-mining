import { describe, expect, it } from "vitest";
import { isJunkQuote } from "./aiAnalysis";

describe("isJunkQuote", () => {
  it("rejects gratitude and engagement noise", () => {
    expect(isJunkQuote("Thank you for this information")).toBe(true);
    expect(isJunkQuote("Great video! Blessings for giving")).toBe(true);
    expect(isJunkQuote("Awesome content, subscribed!")).toBe(true);
    expect(isJunkQuote("Please send me the link")).toBe(true);
    expect(isJunkQuote("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")).toBe(true);
  });

  it("keeps quotes that carry market signal", () => {
    expect(isJunkQuote("I've applied to all of these for years now and nothing")).toBe(false);
    expect(isJunkQuote("Most banks do not do funding with a Google phone number")).toBe(false);
    expect(isJunkQuote("I'm tired of googling and getting so many different answers")).toBe(false);
  });
});
