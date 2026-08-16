import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";

import type { VercelOAuthConfig } from "../src/config.ts";
import { OAUTH_STATE_COOKIE } from "../src/constants.ts";
import type { SessionStore } from "../src/remote-session-store.ts";
import type { StoredSession } from "../src/token-store.ts";
import {
  handleAuthRequest,
  handleCallbackRequest,
  handleSessionSyncRequest,
} from "../src/vercel-handlers.ts";

const config: VercelOAuthConfig = {
  apiVersion: "2026-07",
  appUrl: "https://tih-shopify-ops.vercel.app",
  clientId: "client-id",
  clientSecret: "client-secret",
  port: 3000,
  sessionEncryptionKey: randomBytes(32).toString("base64"),
  shopDomain: "the-inspire-home-au.myshopify.com",
  syncSecret: "sync-secret",
  tokenStorePath: "/tmp/tih-session.json",
};

class MemorySessionStore implements SessionStore {
  session: StoredSession | null = null;

  async load(): Promise<StoredSession | null> {
    return this.session;
  }

  async save(session: StoredSession): Promise<void> {
    this.session = session;
  }
}

test("auth route sets a secure state cookie and redirects to Shopify", () => {
  const response = handleAuthRequest(config);
  const location = new URL(response.headers.get("location") ?? "");
  const state = location.searchParams.get("state");
  const cookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 302);
  assert.equal(location.hostname, config.shopDomain);
  assert.equal(location.searchParams.get("redirect_uri"), `${config.appUrl}/auth/callback`);
  assert.ok(state);
  assert.match(cookie, new RegExp(`^${OAUTH_STATE_COOKIE}=${state}`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test("callback validates Shopify and persists the offline session", async () => {
  const authResponse = handleAuthRequest(config);
  const location = new URL(authResponse.headers.get("location") ?? "");
  const state = location.searchParams.get("state") as string;
  const cookie = (authResponse.headers.get("set-cookie") ?? "").split(";")[0];
  const callback = signedCallbackUrl(state);
  const store = new MemorySessionStore();

  const response = await handleCallbackRequest(
    new Request(callback, { headers: { Cookie: cookie } }),
    {
      config,
      getSessionStore: () => store,
      exchangeCode: async () => ({
        accessToken: "shpat_test_token",
        scopes: ["read_products", "read_orders"],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(store.session?.shopDomain, config.shopDomain);
  assert.deepEqual(store.session?.scopes, ["read_products", "read_orders"]);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("callback rejects a missing state cookie", async () => {
  const response = await handleCallbackRequest(
    new Request(signedCallbackUrl("untrusted-state")),
    { config, getSessionStore: () => new MemorySessionStore() },
  );

  assert.equal(response.status, 400);
  assert.match(await response.text(), /state is invalid or expired/i);
});

test("signed callback identifies a canonical shop-domain mismatch", async () => {
  const authResponse = handleAuthRequest(config);
  const location = new URL(authResponse.headers.get("location") ?? "");
  const state = location.searchParams.get("state") as string;
  const cookie = (authResponse.headers.get("set-cookie") ?? "").split(";")[0];
  const canonicalShop = "canonical-shop.myshopify.com";

  const response = await handleCallbackRequest(
    new Request(signedCallbackUrl(state, canonicalShop), {
      headers: { Cookie: cookie },
    }),
    {
      config,
      getSessionStore: () => new MemorySessionStore(),
    },
  );

  assert.equal(response.status, 400);
  assert.match(await response.text(), new RegExp(canonicalShop));
});

test("session sync requires its bearer secret", async () => {
  const store = new MemorySessionStore();
  store.session = {
    accessToken: "shpat_test_token",
    createdAt: "2026-08-16T00:00:00.000Z",
    scopes: ["read_products"],
    shopDomain: config.shopDomain,
  };

  const denied = await handleSessionSyncRequest(
    new Request(`${config.appUrl}/api/session`),
    config,
    store,
  );
  const allowed = await handleSessionSyncRequest(
    new Request(`${config.appUrl}/api/session`, {
      headers: { Authorization: `Bearer ${config.syncSecret}` },
    }),
    config,
    store,
  );

  assert.equal(denied.status, 401);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json() as StoredSession).shopDomain, config.shopDomain);
});

function signedCallbackUrl(
  state: string,
  shopDomain = config.shopDomain,
): string {
  const url = new URL(`${config.appUrl}/auth/callback`);
  url.searchParams.set("code", "authorization-code");
  url.searchParams.set("shop", shopDomain);
  url.searchParams.set("state", state);
  url.searchParams.set("timestamp", String(Math.floor(Date.now() / 1_000)));
  const message = [...url.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  url.searchParams.set(
    "hmac",
    createHmac("sha256", config.clientSecret).update(message).digest("hex"),
  );
  return url.toString();
}
