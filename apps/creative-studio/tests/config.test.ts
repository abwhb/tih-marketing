import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConfigurationError,
  loadConfig,
  requireDataForSeoAuthorization,
  requireGeminiKey,
} from "../src/config.ts";

const baseEnv = {
  SHOPIFY_API_VERSION: "2026-07",
  SHOPIFY_STORE_DOMAIN: "new-rug-store.myshopify.com",
};

test("accepts GEMINI and Base64 DATAFORSEO aliases", () => {
  const encoded = Buffer.from("api@example.test:secret-password").toString("base64");
  const config = loadConfig(
    { ...baseEnv, GEMINI: "AIza-test", DATAFORSEO: encoded },
    "/repo/apps/creative-studio",
  );
  assert.equal(requireGeminiKey(config), "AIza-test");
  assert.equal(requireDataForSeoAuthorization(config), `Basic ${encoded}`);
  assert.equal(config.repoRoot, "/repo");
});

test("encodes separate DataForSEO login and password", () => {
  const config = loadConfig(
    {
      ...baseEnv,
      DATAFORSEO_LOGIN: "api@example.test",
      DATAFORSEO_PASSWORD: "password",
    },
    "/repo/apps/creative-studio",
  );
  assert.match(requireDataForSeoAuthorization(config), /^Basic /);
});

test("rejects an invalid DATAFORSEO alias", () => {
  assert.throws(
    () =>
      loadConfig(
        { ...baseEnv, DATAFORSEO: Buffer.from("not-a-pair").toString("base64") },
        "/repo/apps/creative-studio",
      ),
    ConfigurationError,
  );
});
