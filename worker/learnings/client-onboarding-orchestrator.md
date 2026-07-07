# Learnings: client-onboarding-orchestrator

Accumulated craft lessons applied on every run.

<!-- 2026-07-07 · job 1 · client: Trent Kus -->
- Add an explicit content-safety pass to the voice rules: raw client onboarding material (voice memos, call transcripts) frequently contains profanity, offensive remarks, or admissions of non-compliant practices. Deliverables must extract the client's energy and phrasing while filtering that content out, defaulting to the client's professional/on-call register rather than their raw private register. The current rules say "write in the client's voice" but never say to sanitize it, which risks leaking unpublishable content into assets.
