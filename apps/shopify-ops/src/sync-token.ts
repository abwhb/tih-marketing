#!/usr/bin/env node

import { loadRemoteSyncConfig, loadRuntimeConfig } from "./config.ts";
import { HTTP_TIMEOUT_MS } from "./constants.ts";
import { FileTokenStore, StoredSessionSchema } from "./token-store.ts";

const runtime = loadRuntimeConfig();
const remote = loadRemoteSyncConfig();

const response = await fetch(new URL("/api/session", remote.appUrl), {
  headers: { Authorization: `Bearer ${remote.syncSecret}` },
  signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
});

if (!response.ok) {
  throw new Error(
    response.status === 404
      ? "No deployed Shopify session exists. Complete OAuth first."
      : `Unable to synchronise the Shopify session (HTTP ${response.status}).`,
  );
}

const parsed = StoredSessionSchema.safeParse(await response.json());
if (!parsed.success || parsed.data.shopDomain !== runtime.shopDomain) {
  throw new Error("The deployed Shopify session is invalid for this store.");
}

await new FileTokenStore(runtime.tokenStorePath).save(parsed.data);
console.log(`Shopify session synchronised for ${runtime.shopDomain}.`);
