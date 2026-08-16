import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import type { OAuthConfig } from "../src/config.ts";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  OAuthStateStore,
  validateCallbackTimestamp,
  verifyShopifyCallbackHmac,
} from "../src/oauth.ts";

const config: OAuthConfig = {
  apiVersion: "2026-07",
  appUrl: "https://example-tunnel.test",
  clientId: "client-id",
  clientSecret: "client-secret",
  port: 3000,
  scopes: "read_products,write_products",
  shopDomain: "example-store.myshopify.com",
  tokenStorePath: "/tmp/session.json",
};

test("buildAuthorizationUrl creates an offline authorization request", () => {
  const url = buildAuthorizationUrl(config, "state-value");
  assert.equal(url.origin, "https://example-store.myshopify.com");
  assert.equal(url.pathname, "/admin/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://example-tunnel.test/auth/callback",
  );
  assert.equal(url.searchParams.get("grant_options[]"), null);
});

test("OAuth state values can be consumed once and expire", () => {
  const store = new OAuthStateStore();
  const state = store.create(1_000);
  assert.equal(store.consume(state, 2_000), true);
  assert.equal(store.consume(state, 2_000), false);

  const expired = store.create(1_000);
  assert.equal(store.consume(expired, 1_000 + 11 * 60 * 1_000), false);
});

test("callback HMAC and timestamp validation accept a signed callback", () => {
  const timestamp = Math.floor(Date.now() / 1_000);
  const url = new URL("https://example.test/auth/callback");
  url.searchParams.set("code", "authorization-code");
  url.searchParams.set("shop", config.shopDomain);
  url.searchParams.set("state", "state-value");
  url.searchParams.set("timestamp", String(timestamp));
  const message = [...url.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  url.searchParams.set(
    "hmac",
    createHmac("sha256", config.clientSecret).update(message).digest("hex"),
  );

  assert.equal(verifyShopifyCallbackHmac(url, config.clientSecret), true);
  assert.equal(validateCallbackTimestamp(url), true);
  url.searchParams.set("code", "tampered");
  assert.equal(verifyShopifyCallbackHmac(url, config.clientSecret), false);
});

test("exchanges an authorization code without requesting an online token", async () => {
  const fakeFetch: typeof fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("code"), "authorization-code");
    assert.equal(body.get("grant_options[]"), null);
    return new Response(
      JSON.stringify({
        access_token: "offline-token",
        scope: "read_products,write_products",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const token = await exchangeAuthorizationCode(
    config,
    "authorization-code",
    fakeFetch,
  );
  assert.equal(token.accessToken, "offline-token");
  assert.deepEqual(token.scopes, ["read_products", "write_products"]);
});
