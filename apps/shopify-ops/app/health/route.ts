import { handleHealthRequest } from "../../src/vercel-handlers.ts";
import { loadVercelDependencies } from "../../src/vercel-runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { config, sessionStore } = loadVercelDependencies();
    return await handleHealthRequest(config, sessionStore);
  } catch (error) {
    console.error(
      "Unable to check Shopify health:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json({ error: "health_unavailable" }, { status: 503 });
  }
}
