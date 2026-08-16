import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CreativeStudioConfig } from "../config.ts";
import {
  BrandTokensSchema,
  type BrandTokens,
  type EvidenceRecord,
} from "../schemas.ts";

export async function loadBrandTokens(
  config: CreativeStudioConfig,
): Promise<BrandTokens> {
  const path = resolve(
    config.repoRoot,
    "brand/the-inspire-home/brand-tokens.json",
  );
  const raw = await readFile(path, "utf8");
  return BrandTokensSchema.parse(JSON.parse(raw) as unknown);
}

export function brandClaimEvidence(brand: BrandTokens): EvidenceRecord[] {
  const observedAt = new Date().toISOString();
  return brand.verifiedGlobalClaims.map((claim, index) => ({
    id: `website-claim-${String(index + 1).padStart(2, "0")}`,
    type: "website_claim",
    source: brand.website,
    observedAt,
    summary: claim,
    facts: { claim },
  }));
}
