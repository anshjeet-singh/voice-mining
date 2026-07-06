export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Google sign-in is handled entirely by our own server routes.
export const getLoginUrl = () => "/api/auth/google";
