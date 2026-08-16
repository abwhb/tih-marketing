import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const DEFAULT_TOKEN_STORE_PATH = resolve(
  APP_ROOT,
  ".data",
  "shopify-session.json",
);
export const DEFAULT_API_VERSION = "2026-07";
export const DEFAULT_AUTH_PORT = 3000;
export const HTTP_TIMEOUT_MS = 30_000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
export const CHARACTER_LIMIT = 25_000;
export const MUTATION_CONFIRMATION = "CONFIRM_SHOPIFY_MUTATION";
export const OAUTH_STATE_COOKIE = "__Host-tih_shopify_oauth_state";
export const REMOTE_SESSION_KEY = "tih:shopify:session:v1";
