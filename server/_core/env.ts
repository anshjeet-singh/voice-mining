export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** Secret used to sign session JWTs. Required in production. */
  sessionSecret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "",
  /** Google OAuth 2.0 web client (Google Cloud Console → Credentials). */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  /** Which LLM powers report generation: "gemini" (default) or "anthropic". */
  llmProvider: (process.env.LLM_PROVIDER ?? "gemini").toLowerCase(),
  /** Google Gemini (AI Studio) — used when LLM_PROVIDER=gemini. */
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  /** Anthropic API — used when LLM_PROVIDER=anthropic. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  /** Shared secret the external cron service sends as `Authorization: Bearer <secret>`. */
  cronSecret: process.env.CRON_SECRET ?? "",
  /** Email that gets the admin role on sign-in (replaces Manus OWNER_OPEN_ID). */
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
