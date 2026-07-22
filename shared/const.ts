export const COOKIE_NAME = "app_session_id";
/** Client-portal session cookie — separate from the owner session on purpose. */
export const PORTAL_COOKIE_NAME = "cc_portal_session";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
