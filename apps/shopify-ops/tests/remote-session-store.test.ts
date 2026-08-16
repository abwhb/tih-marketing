import assert from "node:assert/strict";
import test from "node:test";

import { resolveRedisCredentials } from "../src/remote-session-store.ts";

test("uses Vercel KV REST credentials when provided", () => {
  assert.deepEqual(
    resolveRedisCredentials({
      KV_REST_API_TOKEN: "vercel-token",
      KV_REST_API_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "fallback-token",
      UPSTASH_REDIS_REST_URL: "https://fallback.upstash.io",
    }),
    {
      token: "vercel-token",
      url: "https://example.upstash.io/",
    },
  );
});

test("falls back to standard Upstash REST credentials", () => {
  assert.deepEqual(
    resolveRedisCredentials({
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    }),
    {
      token: "upstash-token",
      url: "https://example.upstash.io/",
    },
  );
});

test("rejects missing or insecure Redis credentials", () => {
  assert.throws(() => resolveRedisCredentials({}), /unavailable/i);
  assert.throws(
    () =>
      resolveRedisCredentials({
        KV_REST_API_TOKEN: "token",
        KV_REST_API_URL: "http://example.upstash.io",
      }),
    /HTTPS/,
  );
});
