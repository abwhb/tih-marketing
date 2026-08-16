import { resolve } from "node:path";
import { z } from "zod";

import {
  DEFAULT_API_VERSION,
  DEFAULT_AUTH_PORT,
  DEFAULT_TOKEN_STORE_PATH,
} from "./constants.ts";

const EnvSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().trim().min(1),
  SHOPIFY_API_VERSION: z
    .string()
    .trim()
    .regex(/^\d{4}-(01|04|07|10)$/)
    .default(DEFAULT_API_VERSION),
  SHOPIFY_TOKEN_STORE_PATH: z.string().trim().optional(),
  SHOPIFY_CLIENT_ID: z.string().trim().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().trim().optional(),
  SHOPIFY_APP_URL: z.string().trim().optional(),
  SHOPIFY_SCOPES: z.string().trim().optional(),
  SHOPIFY_MCP_SYNC_SECRET: z.string().trim().optional(),
  SHOPIFY_SESSION_ENCRYPTION_KEY: z.string().trim().optional(),
  SHOPIFY_AUTH_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(DEFAULT_AUTH_PORT),
});

export interface RuntimeConfig {
  apiVersion: string;
  shopDomain: string;
  tokenStorePath: string;
}

export interface OAuthConfig extends RuntimeConfig {
  appUrl: string;
  clientId: string;
  clientSecret: string;
  port: number;
  scopes?: string;
}

export interface RemoteSyncConfig {
  appUrl: string;
  syncSecret: string;
}

export interface VercelOAuthConfig extends OAuthConfig {
  sessionEncryptionKey: string;
  syncSecret: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function normalizeShopDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new ConfigError(`Missing or invalid environment values: ${keys}`);
  }

  const shopDomain = normalizeShopDomain(parsed.data.SHOPIFY_STORE_DOMAIN);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
    throw new ConfigError(
      "SHOPIFY_STORE_DOMAIN must be the store's *.myshopify.com domain.",
    );
  }

  return {
    apiVersion: parsed.data.SHOPIFY_API_VERSION,
    shopDomain,
    tokenStorePath: parsed.data.SHOPIFY_TOKEN_STORE_PATH
      ? resolve(parsed.data.SHOPIFY_TOKEN_STORE_PATH)
      : DEFAULT_TOKEN_STORE_PATH,
  };
}

export function loadOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): OAuthConfig {
  const runtime = loadRuntimeConfig(env);
  const parsed = EnvSchema.parse(env);
  const missing = [
    ["SHOPIFY_CLIENT_ID", parsed.SHOPIFY_CLIENT_ID],
    ["SHOPIFY_CLIENT_SECRET", parsed.SHOPIFY_CLIENT_SECRET],
    ["SHOPIFY_APP_URL", parsed.SHOPIFY_APP_URL],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new ConfigError(`Missing OAuth environment values: ${missing.join(", ")}`);
  }

  const parsedAppUrl = parsePublicAppUrl(parsed.SHOPIFY_APP_URL as string);

  return {
    ...runtime,
    appUrl: parsedAppUrl.origin,
    clientId: parsed.SHOPIFY_CLIENT_ID as string,
    clientSecret: parsed.SHOPIFY_CLIENT_SECRET as string,
    port: parsed.SHOPIFY_AUTH_PORT,
    ...(parsed.SHOPIFY_SCOPES ? { scopes: parsed.SHOPIFY_SCOPES } : {}),
  };
}

export function loadRemoteSyncConfig(
  env: NodeJS.ProcessEnv = process.env,
): RemoteSyncConfig {
  const parsed = EnvSchema.parse(env);
  const missing = [
    ["SHOPIFY_APP_URL", parsed.SHOPIFY_APP_URL],
    ["SHOPIFY_MCP_SYNC_SECRET", parsed.SHOPIFY_MCP_SYNC_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing remote-sync environment values: ${missing.join(", ")}`,
    );
  }

  return {
    appUrl: parsePublicAppUrl(parsed.SHOPIFY_APP_URL as string).origin,
    syncSecret: parsed.SHOPIFY_MCP_SYNC_SECRET as string,
  };
}

export function loadVercelOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): VercelOAuthConfig {
  const oauth = loadOAuthConfig(env);
  const parsed = EnvSchema.parse(env);
  const missing = [
    ["SHOPIFY_MCP_SYNC_SECRET", parsed.SHOPIFY_MCP_SYNC_SECRET],
    [
      "SHOPIFY_SESSION_ENCRYPTION_KEY",
      parsed.SHOPIFY_SESSION_ENCRYPTION_KEY,
    ],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing deployed OAuth environment values: ${missing.join(", ")}`,
    );
  }

  return {
    ...oauth,
    sessionEncryptionKey: parsed.SHOPIFY_SESSION_ENCRYPTION_KEY as string,
    syncSecret: parsed.SHOPIFY_MCP_SYNC_SECRET as string,
  };
}

function parsePublicAppUrl(value: string): URL {
  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(value);
  } catch {
    throw new ConfigError("SHOPIFY_APP_URL must be a valid public HTTPS URL.");
  }
  if (parsedAppUrl.protocol !== "https:") {
    throw new ConfigError("SHOPIFY_APP_URL must use HTTPS.");
  }
  return parsedAppUrl;
}
