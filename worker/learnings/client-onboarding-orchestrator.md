# Learnings: client-onboarding-orchestrator

Accumulated craft lessons applied on every run.

<!-- 2026-07-07 · job 1 · client: Trent Kus -->
- Add an explicit content-safety pass to the voice rules: raw client onboarding material (voice memos, call transcripts) frequently contains profanity, offensive remarks, or admissions of non-compliant practices. Deliverables must extract the client's energy and phrasing while filtering that content out, defaulting to the client's professional/on-call register rather than their raw private register. The current rules say "write in the client's voice" but never say to sanitize it, which risks leaking unpublishable content into assets.

<!-- 2026-07-09 · job 30001 · client: Trent Kus -->
- The Step 1 format rule tells the writer to open the exemplar client's `Foundations/` folder in Google Drive and match its structure. In local, headless, or no-Drive-connector runs that folder is unreachable, which can stall the step or lead to guessing. State explicitly that the embedded Appendix templates are the authoritative source of truth for shape, and the Drive exemplar is a cross-check to use only when reachable, so a run never blocks on Drive access.
- The Appendix says "no horizontal-rule dividers" but this is a Google Doc filing rule, while the same docs are frequently delivered first as rendering markdown (web app preview) where `---` between major sections aids scannability. Clarify that the no-horizontal-rule constraint applies to the Google Doc upload, not the markdown deliverable, so writers aren't caught between two conflicting formatting instructions.
