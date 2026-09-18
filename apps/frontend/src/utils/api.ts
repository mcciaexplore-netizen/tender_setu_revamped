// In the deployed service the API and SPA share one origin.  VITE_API_URL is
// only needed when developing against a separately started local backend.
const rawUrl = (import.meta.env.VITE_API_URL as string) || "";

export const API_URL = rawUrl.replace(/\/$/, "");
