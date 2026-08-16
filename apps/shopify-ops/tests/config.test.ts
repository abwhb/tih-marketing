import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigError,
  loadRuntimeConfig,
  normalizeShopDomain,
} from "../src/config.ts";

test("normalizeShopDomain accepts a full Shopify URL", () => {
  assert.equal(
    normalizeShopDomain("https://Example-Store.myshopify.com/"),
    "example-store.myshopify.com",
  );
});

test("loadRuntimeConfig rejects custom storefront domains", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        SHOPIFY_STORE_DOMAIN: "example.com",
        SHOPIFY_API_VERSION: "2026-07",
      }),
    ConfigError,
  );
});

test("loadRuntimeConfig accepts supported quarterly API versions", () => {
  const config = loadRuntimeConfig({
    SHOPIFY_STORE_DOMAIN: "example-store.myshopify.com",
    SHOPIFY_API_VERSION: "2026-07",
  });
  assert.equal(config.apiVersion, "2026-07");
  assert.equal(config.shopDomain, "example-store.myshopify.com");
});
