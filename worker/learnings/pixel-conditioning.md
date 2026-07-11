# Learnings: pixel-conditioning

Accumulated craft lessons applied on every run.

<!-- 2026-07-11 · job 210003 · client: Trent Kus -->
- The skill's standard-events table uses Meta copy-names (ViewContent, Lead, CompleteRegistration, Schedule, AddToCart, InitiateCheckout, Purchase) but the ad-stage instruction and finance/credit client work rely on backup API-token events (installed_app, donate, search) and a "financial services draws a partial restriction, condition backups from launch" rule that appear nowhere in the skill. Add a short restricted-vertical note covering the backup events to condition when the primary conversion event can be partially restricted.
