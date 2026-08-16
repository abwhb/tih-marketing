import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

import { HTTP_TIMEOUT_MS, OAUTH_STATE_TTL_MS } from "./constants.ts";
import type { OAuthConfig } from "./config.ts";
import type { StoredSession } from "./token-store.ts";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string().default(""),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});

export interface OAuthToken {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  scopes: string[];
}

export function createStoredSession(
  token: OAuthToken,
  shopDomain: string,
  now = Date.now(),
): StoredSession {
  return {
    accessToken: token.accessToken,
    createdAt: new Date(now).toISOString(),
    scopes: token.scopes,
    shopDomain,
    ...(token.expiresIn
      ? { expiresAt: new Date(now + token.expiresIn * 1_000).toISOString() }
      : {}),
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    ...(token.refreshTokenExpiresIn
      ? {
          refreshTokenExpiresAt: new Date(
            now + token.refreshTokenExpiresIn * 1_000,
          ).toISOString(),
        }
      : {}),
  };
}

export class ShopifyOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyOAuthError";
  }
}

export class OAuthStateStore {
  private readonly states = new Map<string, number>();

  create(now = Date.now()): string {
    this.prune(now);
    const state = randomBytes(24).toString("hex");
    this.states.set(state, now + OAUTH_STATE_TTL_MS);
    return state;
  }

  consume(state: string, now = Date.now()): boolean {
    const expiresAt = this.states.get(state);
    this.states.delete(state);
    return expiresAt !== undefined && expiresAt >= now;
  }

  private prune(now: number): void {
    for (const [state, expiresAt] of this.states) {
      if (expiresAt < now) {
        this.states.delete(state);
      }
    }
  }
}

export function buildAuthorizationUrl(
  config: OAuthConfig,
  state: string,
): URL {
  const url = new URL(`https://${config.shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set(
    "redirect_uri",
    new URL("/auth/callback", config.appUrl).toString(),
  );
  url.searchParams.set("state", state);
  if (config.scopes) {
    url.searchParams.set("scope", config.scopes);
  }
  return url;
}

export function verifyShopifyCallbackHmac(
  callbackUrl: URL,
  clientSecret: string,
): boolean {
  const suppliedHmac = callbackUrl.searchParams.get("hmac");
  if (!suppliedHmac || !/^[a-f0-9]{64}$/i.test(suppliedHmac)) {
    return false;
  }

  const message = [...callbackUrl.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const calculated = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(calculated, "hex"),
    Buffer.from(suppliedHmac, "hex"),
  );
}

export function validateCallbackTimestamp(
  callbackUrl: URL,
  now = Date.now(),
): boolean {
  const timestamp = Number(callbackUrl.searchParams.get("timestamp"));
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Math.abs(now - timestamp * 1_000) <= OAUTH_STATE_TTL_MS;
}

export async function exchangeAuthorizationCode(
  config: OAuthConfig,
  code: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
  });

  const response = await fetchImplementation(
    `https://${config.shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new ShopifyOAuthError(
      `Shopify rejected the authorization-code exchange with HTTP ${response.status}.`,
    );
  }

  const parsed = TokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ShopifyOAuthError(
      "Shopify returned an unexpected access-token response.",
    );
  }

  return {
    accessToken: parsed.data.access_token,
    scopes: parsed.data.scope
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    ...(parsed.data.expires_in ? { expiresIn: parsed.data.expires_in } : {}),
    ...(parsed.data.refresh_token
      ? { refreshToken: parsed.data.refresh_token }
      : {}),
    ...(parsed.data.refresh_token_expires_in
      ? { refreshTokenExpiresIn: parsed.data.refresh_token_expires_in }
      : {}),
  };
}
