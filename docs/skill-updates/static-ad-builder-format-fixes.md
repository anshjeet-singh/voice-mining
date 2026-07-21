# static-ad-builder skill update: fix the four failing formats

**How to use this doc:** paste it into a claude.ai session that has edit access
to the `static-ad-builder` skill (same handoff as the skool-community-builder
v2 update). The local pipeline treats the skill as read-only, so these render
fixes must land in the skill itself. The dashboard side is already enforced:
these four formats are quarantined from default batch mixes and only build
when explicitly requested (static-render-rules rule 8).

## Operator verdicts driving this (batch review, 2026-07-21, client Ibby)

- **napkin-handwriting** — "does not look like a napkin at all." Render was a
  flat white rounded rectangle with a handwriting font on a plain brown block.
- **offer-poster** — "I don't know what the hell that even is talking about."
  Eyebrow + headline + subhead + price pill + CTA all competing; no hierarchy.
- **tombstone-shock** — "looks very weird, this weird contrast." Glowing
  text over an invented illustrated graveyard matching no reference.
- **photo-caption-chips** — flat illustrated background where the format's
  whole illusion depends on a real photograph.

## Required changes, per format

### 1. napkin-handwriting → photoreal or don't ship
- The base layer MUST be a photographed or photoreal-generated napkin/paper
  asset: visible paper grain, deckled or embossed edges, soft real shadow on a
  believable surface (wood table, cafe counter), slight perspective skew.
- Ship 2-3 real napkin base images in the skill's `assets/` (photograph a
  napkin or generate object-only images — no people) and composite marker
  text ONTO them following the paper's perspective, with ink texture (slight
  alpha/roughness), never crisp vector strokes.
- If no napkin base asset is available at build time, the pipeline must
  REFUSE the format and swap to notes/handwriting-on-lined-paper instead of
  emitting a flat rectangle.

### 2. offer-poster → one claim, fixed hierarchy, clone-only
- Poster builds are CLONE-ONLY from a specific catalog reference; no
  improvised layouts. Encode 1-2 poster templates matching the reference
  library's proven posters exactly (spacing, weights, block order).
- Copy contract: ONE claim (headline), ONE support line, ONE offer element,
  ONE CTA. If the brief carries more elements, the builder must cut, not
  stack. A poster whose message needs two reads fails QA.

### 3. tombstone-shock → reference-matched palette or swap
- Build only as a side-by-side clone of the exact catalog tombstone
  reference: same palette, same lighting, same composition. No glow effects,
  no gradients, no scene elements the reference lacks.
- If the reference's illustration style can't be reproduced cleanly by the
  pipeline, swap the angle to big-text-highlight and note the swap.

### 4. photo-caption-chips → real photo base required
- The base MUST be a real photograph (client-supplied proof/lifestyle image)
  or a photoreal generated ENVIRONMENT (room, desk, street — never a person).
  Illustrated/cartoon backgrounds are a publish blocker for this format.
- Caption chips composite in the platform's real chip style (real chrome
  crops where they exist), sized/positioned as in the reference screenshots.

## QA additions for the skill's own checklist
- Napkin: "would you believe this napkin was photographed?" — else fail.
- Poster: "can the message be understood in one second?" — else fail.
- Tombstone: side-by-side with the reference — palette must match.
- Photo-chips: "is the background a believable photo?" — else fail.

## Context the skill should know
- The app now grades every rendered batch with an independent QA session and
  tracks real Meta CTR per ad; formats that keep underperforming will show up
  as UNDERPERFORMING in the REFERENCE PERFORMANCE section of future briefs.
- Approved native formats WITHOUT catalog images (calendar, reminders,
  email-inbox) are first-class: keep their specs in native-formats.md sharp,
  since batches clone them from the skill's own reference screenshots.
