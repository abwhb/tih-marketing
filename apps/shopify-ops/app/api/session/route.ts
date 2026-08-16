import { handleSessionSyncRequest } from "../../../src/vercel-handlers.ts";
import { loadVercelDependencies } from "../../../src/vercel-runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { config, sessionStore } = loadVercelDependencies();
    return await handleSessionSyncRequest(request, config, sessionStore);
  } catch (error) {
    console.error(
      "Unable to synchronise Shopify session:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json({ error: "session_unavailable" }, { status: 503 });
  }
}
