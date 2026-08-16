import { loadVercelOAuthConfig } from "../../../src/config.ts";
import { RedisSessionStore } from "../../../src/remote-session-store.ts";
import { handleCallbackRequest } from "../../../src/vercel-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = loadVercelOAuthConfig();
    return await handleCallbackRequest(request, {
      config,
      getSessionStore: () =>
        new RedisSessionStore(config.sessionEncryptionKey),
    });
  } catch (error) {
    console.error(
      "Unable to handle Shopify OAuth callback:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json({ error: "oauth_unavailable" }, { status: 503 });
  }
}
