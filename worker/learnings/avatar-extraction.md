# Learnings: avatar-extraction

Accumulated craft lessons applied on every run.

<!-- 2026-07-07 · job 1 · client: Trent Kus -->
- The mother pipeline depends on named sub-avatars (the awareness map, ads, and offers all key off them), but this skill's output template only produces a single Primary Avatar. Add an explicit "Sub-avatars (2–4)" section to the output so the handoff to schwartz-awareness-mapper carries distinct segments instead of one blended persona.
- The process step lists "Hidden motivations (status, control, relief)" but the output template omits a field for them. Add a "Hidden Motivations" line to the output so that layer isn't lost between process and deliverable.

<!-- 2026-07-10 · framework mining session -->
- Structure extraction around Georgi's 7 research questions and slice the market into 2 to 4 sub-avatars with buying reasons across all 10 categories (functional, emotional, social, financial, time, risk, status, identity, situational, comparative) so ad angles fall out of the research automatically (frameworks/dr-masters-scavenge.md section 2, frameworks/ad-script-system.md). Chase every vague complaint with Meta Model questions until it becomes a concrete picturable scene (frameworks/mclaughlin-language-patterns.md section 15).

<!-- 2026-07-13 · job 330001 · client: Blake Matthews -->
- The Sub-Avatars output must be machine-parseable into audience chips. Each sub-avatar has to be a `### <Short Name> — <descriptor>` heading where the descriptor after the dash stands alone and names occupation/role, income band, and situation in plain words (e.g. "high-earning sales pros ($150k-$300k) who hit their income ceiling"). A descriptor that only makes sense alongside the name, or that omits the income band or role, breaks the downstream chip parse. State this format requirement in the output template so every run produces it.
