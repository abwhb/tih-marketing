import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { FileTokenStore } from "../src/token-store.ts";

const testDirectory = await mkdtemp(join(tmpdir(), "tih-shopify-token-test-"));
after(async () => rm(testDirectory, { recursive: true, force: true }));

test("stores and loads a Shopify session with private file permissions", async () => {
  const path = join(testDirectory, "session.json");
  const store = new FileTokenStore(path);
  await store.save({
    accessToken: "secret-token",
    createdAt: new Date().toISOString(),
    scopes: ["read_products"],
    shopDomain: "example-store.myshopify.com",
  });

  const loaded = await store.load();
  assert.equal(loaded?.accessToken, "secret-token");
  assert.deepEqual(loaded?.scopes, ["read_products"]);
  const details = await stat(path);
  assert.equal(details.mode & 0o777, 0o600);
});

test("returns null when no session has been stored", async () => {
  const store = new FileTokenStore(join(testDirectory, "missing.json"));
  assert.equal(await store.load(), null);
});
