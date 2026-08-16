import { timingSafeEqual } from "node:crypto";

import type { VercelOAuthConfig } from "./config.ts";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS } from "./constants.ts";
import {
  buildAuthorizationUrl,
  createStoredSession,
  exchangeAuthorizationCode,
  type OAuthToken,
  OAuthStateStore,
  validateCallbackTimestamp,
  verifyShopifyCallbackHmac,
} from "./oauth.ts";
import type { SessionStore } from "./remote-session-store.ts";

type ExchangeCode = (
  config: VercelOAuthConfig,
  code: string,
) => Promise<OAuthToken>;

export interface CallbackDependencies {
  config: VercelOAuthConfig;
  getSessionStore: () => SessionStore;
  exchangeCode?: ExchangeCode;
}

export function handleAuthRequest(config: VercelOAuthConfig): Response {
  const state = new OAuthStateStore().create();
  return secureResponse(
    new Response(null, {
      status: 302,
      headers: {
        Location: buildAuthorizationUrl(config, state).toString(),
        "Set-Cookie": stateCookie(state),
      },
    }),
  );
}

export async function handleCallbackRequest(
  request: Request,
  dependencies: CallbackDependencies,
): Promise<Response> {
  const { config } = dependencies;
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return htmlResponse(400, `Shopify denied access: ${oauthError}`, false, true);
  }

  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!shop || !code || !state) {
    const missingFields = [
      ...(shop ? [] : ["shop"]),
      ...(code ? [] : ["code"]),
      ...(state ? [] : ["state"]),
    ];
    console.warn("Shopify OAuth callback missing fields:", missingFields.join(","));
    return htmlResponse(
      400,
      `The OAuth callback is missing: ${missingFields.join(", ")}. Start again from /auth.`,
      false,
      true,
    );
  }
  if (!verifyShopifyCallbackHmac(url, config.clientSecret)) {
    return htmlResponse(400, "The OAuth callback signature is invalid.", false, true);
  }
  if (!validateCallbackTimestamp(url)) {
    return htmlResponse(400, "The OAuth callback has expired.", false, true);
  }

  const cookieState = readCookie(
    request.headers.get("cookie"),
    OAUTH_STATE_COOKIE,
  );
  if (!cookieState || !constantTimeEqual(cookieState, state)) {
    return htmlResponse(400, "The OAuth state is invalid or expired.", false, true);
  }
  if (shop.toLowerCase() !== config.shopDomain) {
    console.warn("Shopify OAuth callback shop did not match configured store.");
    return htmlResponse(
      400,
      `Shopify returned ${shop}, but SHOPIFY_STORE_DOMAIN is ${config.shopDomain}. Update the configured value and start again from /auth.`,
      false,
      true,
    );
  }

  try {
    const exchangeCode =
      dependencies.exchangeCode ?? exchangeAuthorizationCode;
    const token = await exchangeCode(config, code);
    const session = createStoredSession(token, config.shopDomain);
    await dependencies.getSessionStore().save(session);
    return htmlResponse(
      200,
      `Connected to ${config.shopDomain} with ${session.scopes.length} granted scopes. You can now synchronise the token to the local MCP server.`,
      true,
      true,
    );
  } catch (error) {
    console.error(
      "Shopify OAuth callback failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return htmlResponse(
      500,
      "The Shopify connection failed. Check the Vercel function logs and try again.",
      false,
      true,
    );
  }
}

export async function handleHealthRequest(
  config: VercelOAuthConfig,
  sessionStore: SessionStore,
): Promise<Response> {
  try {
    const session = await sessionStore.load();
    return jsonResponse(200, {
      connected: session?.shopDomain === config.shopDomain,
      shopDomain: config.shopDomain,
    });
  } catch (error) {
    console.error(
      "Shopify health check failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(503, {
      connected: false,
      error: "storage_unavailable",
      shopDomain: config.shopDomain,
    });
  }
}

export async function handleSessionSyncRequest(
  request: Request,
  config: VercelOAuthConfig,
  sessionStore: SessionStore,
): Promise<Response> {
  if (!validBearerToken(request.headers.get("authorization"), config.syncSecret)) {
    return jsonResponse(401, { error: "unauthorised" });
  }

  try {
    const session = await sessionStore.load();
    if (!session || session.shopDomain !== config.shopDomain) {
      return jsonResponse(404, { error: "shopify_session_not_found" });
    }
    return jsonResponse(200, session);
  } catch (error) {
    console.error(
      "Shopify session sync failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(503, { error: "storage_unavailable" });
  }
}

export function handleRootRequest(): Response {
  return htmlResponse(
    200,
    "Secure Shopify OAuth gateway for The Inspire Home.",
    false,
    false,
  );
}

function validBearerToken(value: string | null, secret: string): boolean {
  if (!value) {
    return false;
  }
  return constantTimeEqual(value, `Bearer ${secret}`);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function stateCookie(value: string): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1_000)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function htmlResponse(
  status: number,
  message: string,
  connected: boolean,
  clearState: boolean,
): Response {
  const safeMessage = escapeHtml(message);
  const response = new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TIH Shopify Ops</title>
  <style>body{font:16px/1.5 system-ui,sans-serif;max-width:680px;margin:10vh auto;padding:24px;color:#1c1c1c}a{display:inline-block;padding:10px 16px;background:#1c1c1c;color:white;text-decoration:none;border-radius:6px}.ok{color:#16794c}</style>
</head>
<body>
  <h1>TIH Shopify Ops</h1>
  <p class="${connected ? "ok" : ""}">${safeMessage}</p>
  ${connected ? "" : '<p><a href="/auth">Connect Shopify</a></p>'}
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(clearState ? { "Set-Cookie": clearStateCookie() } : {}),
    },
  });
  return secureResponse(response);
}

function jsonResponse(status: number, value: unknown): Response {
  return secureResponse(
    Response.json(value, {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

function secureResponse(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'",
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });
}
