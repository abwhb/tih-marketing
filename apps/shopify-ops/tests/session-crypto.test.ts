import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  decryptStoredSession,
  encryptStoredSession,
  SessionCryptoError,
} from "../src/session-crypto.ts";
import type { StoredSession } from "../src/token-store.ts";

const session: StoredSession = {
  accessToken: "shpat_test_token",
  createdAt: "2026-08-16T00:00:00.000Z",
  scopes: ["read_products"],
  shopDomain: "the-inspire-home-au.myshopify.com",
};

test("encrypts and decrypts a stored session", () => {
  const key = randomBytes(32).toString("base64");
  const encrypted = encryptStoredSession(session, key);

  assert.notEqual(encrypted.includes(session.accessToken), true);
  assert.deepEqual(decryptStoredSession(encrypted, key), session);
});

test("rejects tampered encrypted sessions", () => {
  const key = randomBytes(32).toString("base64");
  const encrypted = encryptStoredSession(session, key);
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

  assert.throws(
    () => decryptStoredSession(tampered, key),
    SessionCryptoError,
  );
});
