import { handleRootRequest } from "../src/vercel-handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return handleRootRequest();
}
