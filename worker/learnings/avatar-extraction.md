# Learnings: avatar-extraction

Accumulated craft lessons applied on every run.

<!-- 2026-07-07 · job 1 · client: Trent Kus -->
- The mother pipeline depends on named sub-avatars (the awareness map, ads, and offers all key off them), but this skill's output template only produces a single Primary Avatar. Add an explicit "Sub-avatars (2–4)" section to the output so the handoff to schwartz-awareness-mapper carries distinct segments instead of one blended persona.
- The process step lists "Hidden motivations (status, control, relief)" but the output template omits a field for them. Add a "Hidden Motivations" line to the output so that layer isn't lost between process and deliverable.

<!-- 2026-07-10 · framework mining session -->
- Structure extraction around Georgi's 7 research questions and slice the market into 2 to 4 sub-avatars with buying reasons across all 10 categories (functional, emotional, social, financial, time, risk, status, identity, situational, comparative) so ad angles fall out of the research automatically (frameworks/dr-masters-scavenge.md section 2, frameworks/ad-script-system.md). Chase every vague complaint with Meta Model questions until it becomes a concrete picturable scene (frameworks/mclaughlin-language-patterns.md section 15).

<!-- 2026-07-13 · job 330001 · client: Blake Matthews -->
- The Sub-Avatars output must be machine-parseable into audience chips. Each sub-avatar has to be a `### <Short Name> — <descriptor>` heading where the descriptor after the dash stands alone and names occupation/role, income band, and situation in plain words (e.g. "high-earning sales pros ($150k-$300k) who hit their income ceiling"). A descriptor that only makes sense alongside the name, or that omits the income band or role, breaks the downstream chip parse. State this format requirement in the output template so every run produces it.

<!-- 2026-07-14 · job 390001 · client: Blake Matthews -->
- The output template lists "Failed Attempts:" as a single flat line, but the ICP owns the first half of the unique mechanism and mechanism-builder needs a real brief from it. Change the output to a paired Failed Solutions table with three columns: what they tried, why it failed (reframed so the fault is the method's, not theirs), and the gap a working mechanism must fill. That third column is the direct handoff to mechanism-builder and stops the failed-solutions section from being a competitor list.
- The output has no "Customer Language Bank organized by section-of-use." Downstream copy skills (headline machine, VSL, ads) grab verbatims by slot (pain lines, desire lines, objection lines, identity/self-label lines). Add a language-bank field grouped by those four uses, and require preserving the market's exact modal operators and quantifiers ("I can't," "every," "never") rather than paraphrasing them into neutral English, so the chaining and mirroring leverage survives to the copy stage.

<!-- 2026-07-14 · job 420001 · client: Trent Kus -->
- Sub-avatar sets often need a cross-cutting PSYCHOGRAPHIC overlay (a burned/skeptic, a fearful, an already-scaled disposition) that sits on top of the demographic segments rather than beside them. It still gets a parseable `### Name — descriptor` heading and its own pains/desires/objections, but it should be marked "cross-cutting" with no separate % of pool (the three demographic segments still sum to 100%), so the roster does not double-count the pool or force a false demographic on an emotional-state segment.

<!-- 2026-07-14 · job 420003 · client: Blake Matthews -->
- The output template only defines a single flat "Primary Avatar" block. It must require a Sub-Avatars section of 3 to 5 entries, each written as a `### <Short Name> — <descriptor>` heading where the descriptor after the dash stands alone and names occupation/role, income band, and situation in plain words. The downstream app parses that name-plus-descriptor into audience chips, so a descriptor that only makes sense next to the name, or that omits the income band/role, breaks the parse. This is true for every client, not a per-client preference.
- The dash inside the sub-avatar heading is a load-bearing em dash the parser depends on. It is the single exception to the global no-em-dash rule, which applies everywhere else in the doc. Encode that exception in the skill so runs do not either strip the required dash or leak stray em dashes into body prose.
- Add an explicit Hidden Motivations line (status, control, relief) to the output. The process asks for it but the template drops it every time.
