import { loadVercelOAuthConfig } from "../../src/config.ts";
import { handleAuthRequest } from "../../src/vercel-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return handleAuthRequest(loadVercelOAuthConfig());
  } catch (error) {
    console.error(
      "Unable to start Shopify OAuth:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json({ error: "oauth_unavailable" }, { status: 503 });
  }
}
