import { createServer, type ServerResponse } from "node:http";

import { loadOAuthConfig } from "./config.ts";
import {
  buildAuthorizationUrl,
  createStoredSession,
  exchangeAuthorizationCode,
  OAuthStateStore,
  validateCallbackTimestamp,
  verifyShopifyCallbackHmac,
} from "./oauth.ts";
import { FileTokenStore } from "./token-store.ts";

const config = loadOAuthConfig();
const stateStore = new OAuthStateStore();
const tokenStore = new FileTokenStore(config.tokenStorePath);

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${config.port}`);

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    if (url.pathname === "/health") {
      const session = await tokenStore.load();
      sendJson(response, 200, {
        connected: session?.shopDomain === config.shopDomain,
        shopDomain: config.shopDomain,
      });
      return;
    }

    if (url.pathname === "/auth") {
      const state = stateStore.create();
      response.writeHead(302, {
        Location: buildAuthorizationUrl(config, state).toString(),
      });
      response.end();
      return;
    }

    if (url.pathname === "/auth/callback") {
      await handleCallback(url, response);
      return;
    }

    if (url.pathname === "/") {
      const session = await tokenStore.load();
      sendHtml(
        response,
        200,
        page(
          session?.shopDomain === config.shopDomain
            ? "Shopify is connected. You can now start the TIH MCP server."
            : "Shopify is not connected yet.",
          session?.shopDomain === config.shopDomain,
        ),
      );
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unexpected auth error");
    sendHtml(
      response,
      500,
      page("The Shopify connection failed. Check the server logs and try again.", false),
    );
  }
});

async function handleCallback(url: URL, response: ServerResponse): Promise<void> {
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    sendHtml(response, 400, page(`Shopify denied access: ${oauthError}`, false));
    return;
  }

  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!shop || shop.toLowerCase() !== config.shopDomain || !code || !state) {
    sendHtml(response, 400, page("The OAuth callback is incomplete or invalid.", false));
    return;
  }
  if (!verifyShopifyCallbackHmac(url, config.clientSecret)) {
    sendHtml(response, 400, page("The OAuth callback signature is invalid.", false));
    return;
  }
  if (!validateCallbackTimestamp(url)) {
    sendHtml(response, 400, page("The OAuth callback has expired.", false));
    return;
  }
  if (!stateStore.consume(state)) {
    sendHtml(response, 400, page("The OAuth state is invalid or expired.", false));
    return;
  }

  const token = await exchangeAuthorizationCode(config, code);
  const session = createStoredSession(token, config.shopDomain);
  await tokenStore.save(session);

  sendHtml(
    response,
    200,
    page(
      `Connected to ${config.shopDomain} with ${session.scopes.length} granted scopes.`,
      true,
    ),
  );
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: Record<string, unknown>,
): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function page(message: string, connected: boolean): string {
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
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
</html>`;
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

server.listen(config.port, "127.0.0.1", () => {
  console.log(`TIH Shopify OAuth server listening on http://127.0.0.1:${config.port}`);
  console.log(`Public callback: ${new URL("/auth/callback", config.appUrl).toString()}`);
});
