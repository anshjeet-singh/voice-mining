/**
 * The ad-batch request phrases, single-sourced. The studio composes them and
 * the worker's shard planner regex-parses them: any phrasing drift between
 * the two silently disables sharding, so both sides import from HERE.
 */

/** The canonical fresh-batch request opener the statics engine composes. */
export function newStaticsRequest(count: number): string {
  return `Generate EXACTLY ${count} NEW static ads.`;
}

/** Matches the fresh-batch opener and captures the count. */
export const NEW_STATICS_RE = /Generate EXACTLY (\d+) NEW static ads/i;

/** The rebuild-only header both the gallery and the contracts use. */
export const REBUILD_ONLY_RE = /REBUILD ONLY/i;
