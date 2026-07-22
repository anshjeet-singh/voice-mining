# Learnings: static-render-rules

Accumulated craft lessons applied on every run.

<!-- 2026-07-21 · job 720008 · client: Ibby -->
- Rule 2 (CTA slot by format) needs the offer-poster and tombstone-shock cases stated explicitly: offer-poster carries its CTA in the pill slot, tombstone-shock has no native CTA slot and ships CTA-free with the primary text carrying the ask. Writers keep re-deriving which designed formats get an on-image CTA; a one-line map (poster = pill, tombstone = none, ui-vs-ui = twin captions only) would settle it.

<!-- 2026-07-22 · job 810001 · client: Blake Matthews -->
- On the occupation-callout / big-text spotlight format, the flat radial spotlight glow is full-bleed background and legitimately trips qa_extents() at the right margin (max_x ~1015 to 1035), the same as a divider or search pill. Treat a right-edge flag on these formats as the glow (verify by viewing), not a text overflow, so a builder does not shrink correct hero copy chasing a false positive.

<!-- 2026-07-22 · job 840003 · client: Blake Matthews -->
- none
