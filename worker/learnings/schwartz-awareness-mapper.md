# Learnings: schwartz-awareness-mapper

Accumulated craft lessons applied on every run.

<!-- 2026-07-14 · job 390001 · client: Blake Matthews -->
- The output stops at awareness stage + messaging rules per avatar, but offer-architecture segments by decision stage and tracks LTV by entry point, so the ICP's awareness map has to tie each stage to (a) the message focus, (b) the offer tier it points at, and (c) its share of the pool. Add "Offer Tier" and "% of pool" to the output so the awareness map is a usable routing table, not an abstract Schwartz ladder. Also add one line instructing the writer to frame the ladder's endpoint and the Big Domino to the funnel branch (webinar ends at "take the spot / book the call"; call funnel ends at the VSL-to-application handoff).

<!-- 2026-07-14 · job 420001 · client: Trent Kus -->
- The awareness map reads as a usable routing table only when each stage row carries four columns together: the segment(s) that sit there, the message focus, the offer tier it points at, and its share of the pool, ending at the funnel-branch handoff (call funnel ends at the VSL-to-application). Presenting stages as a bare Schwartz ladder without the offer-tier and %-of-pool columns forces every downstream skill to re-derive the routing.

<!-- 2026-07-14 · job 420003 · client: Blake Matthews -->
- The awareness output should not be a bare Schwartz ladder. It must be a routing table with, per row, the segment(s) sitting there, the message focus, the offer tier it points at, and its % of pool. Omitting offer-tier and %-of-pool forces every downstream skill (deck, emails, ads) to re-derive routing and is a recurring defect.
- Tie the ladder endpoint to the funnel branch: webinar funnels end on "take the spot / book the call," call funnels end on the VSL-to-application handoff, and the Big Domino is framed to that branch.

<!-- 2026-07-15 · job 420009 · client: Trent Kus -->
- The skill outputs one awareness stage, but the mother pipeline needs a stage PER sub-avatar plus a cross-cutting overlay that can sit at a different (more distrustful) awareness than its underlying demographic segment. State that the map is produced per sub-avatar and that a psychographic overlay (e.g. a burned skeptic) is mapped separately from the demographic segments it spans.

<!-- 2026-07-16 · job 510001 · client: Veda Ray -->
- When the buying unit is a couple with a decision-maker and a skeptical veto-holder (mother/father here, but also spouse pairs in health and finance), the awareness map must model the veto-holder as a cross-cutting overlay sitting one rung MORE distrustful than the primary buyer at the same factual awareness. Mapping only the buyer's awareness leaves the funnel with no home for the objection-handling track (FAQ/breakout videos) aimed at the person who can kill the sale. State that a two-person buying unit gets a separate, lower-awareness overlay row.
