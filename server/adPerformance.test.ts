import { describe, expect, it } from "vitest";
import { formatMarketTruth, matchAssetFilename, parseAdSpecs, parseMetaCsv } from "./adPerformance";

describe("parseMetaCsv", () => {
  it("parses a standard Ads Manager export", () => {
    const csv = [
      "Ad name,Amount spent (USD),CTR (all),Cost per result,Results",
      'ibby_ad01_notes-dark_order,"$142.10",2.31%,$8.40,17',
      "ibby_ad05_search_bad-credit,55.00,1.02,12.75,4",
    ].join("\n");
    const rows = parseMetaCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ adName: "ibby_ad01_notes-dark_order", spend: 142.1, ctr: 2.31, cpl: 8.4 });
    expect(rows[1].spend).toBe(55);
  });

  it("handles tab-separated pastes and missing columns", () => {
    const tsv = "Ad name\tAmount spent\nMy Ad\t99.50";
    const rows = parseMetaCsv(tsv);
    expect(rows[0]).toEqual({ adName: "My Ad", spend: 99.5, ctr: null, cpl: null });
  });

  it("returns empty when there is no ad-name column", () => {
    expect(parseMetaCsv("Campaign,Spend\nX,1")).toEqual([]);
  });
});

describe("matchAssetFilename", () => {
  const files = ["ibby_ad01_notes-dark_order.png", "ibby_ad05_search_bad-credit-funding.png"];
  it("matches Meta ad names to filenames despite prefixes and extensions", () => {
    expect(matchAssetFilename("ibby_ad01_notes-dark_order", files)).toBe(files[0]);
    expect(matchAssetFilename("[CBO] ibby_ad05_search_bad-credit-funding v2", files)).toBe(files[1]);
    expect(matchAssetFilename("ibby ad05 search bad credit funding", files)).toBe(files[1]);
  });
  it("returns null when nothing matches", () => {
    expect(matchAssetFilename("totally-different", files)).toBeNull();
  });
});

describe("parseAdSpecs", () => {
  it("parses labeled DNA lines from a batch doc", () => {
    const doc = [
      "## Ad 1 — ibby_ad01_notes-dark_order.png",
      "- Format: notes-dark",
      "- Reference: notes-dark_order_02.png",
      "- Sub-avatar: The Scaler",
      "- Angle: right order beats big score",
      "- Awareness: problem aware",
      "- Hook category: contrarian-claim",
      "- Primary text: I make good money. I still got declined. The order was the problem, not me. Join the free community below.",
      "- Headline: Right Order = Fundable",
      "- Description: Free community, no card",
      "QA: viewed against reference, passed",
      "## Ad 2 — ibby_ad02_tweet.png",
      "**Format**: tweet",
    ].join("\n");
    const specs = parseAdSpecs(doc, ["ibby_ad01_notes-dark_order.png", "ibby_ad02_tweet.png"]);
    expect(specs["ibby_ad01_notes-dark_order.png"]).toEqual({
      format: "notes-dark",
      reference: "notes-dark_order_02.png",
      subAvatar: "The Scaler",
      angle: "right order beats big score",
      awareness: "problem aware",
      hookCategory: "contrarian-claim",
      copyPrimary: "I make good money. I still got declined. The order was the problem, not me. Join the free community below.",
      copyHeadline: "Right Order = Fundable",
      copyDescription: "Free community, no card",
    });
    expect(specs["ibby_ad02_tweet.png"]).toEqual({ format: "tweet" });
  });
});

describe("formatMarketTruth", () => {
  it("formats spend results best-CTR-first and skips ads with no data", () => {
    const s = formatMarketTruth([
      { filename: "a.png", status: "approved", metaSpend: 50, metaCtr: 1.1, metaCpl: 9, format: "tweet", hookCategory: null, awareness: null, subAvatar: null },
      { filename: "b.png", status: "approved", metaSpend: 80, metaCtr: 2.4, metaCpl: 5, format: "notes-dark", hookCategory: "data-shock", awareness: null, subAvatar: null },
      { filename: "c.png", status: "pending", metaSpend: null, metaCtr: null, metaCpl: null },
    ]);
    const lines = s.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("b.png");
    expect(lines[0]).toContain("CTR 2.4%");
    expect(s).not.toContain("c.png");
  });
  it("returns empty with no performance data", () => {
    expect(formatMarketTruth([{ filename: "x", status: "pending", metaSpend: null, metaCtr: null, metaCpl: null }])).toBe("");
  });
});
