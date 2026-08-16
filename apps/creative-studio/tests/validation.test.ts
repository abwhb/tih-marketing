import assert from "node:assert/strict";
import { test } from "node:test";

import type { CreativeBatch, EvidenceRecord } from "../src/schemas.ts";
import { validateBatchGrounding } from "../src/services/validation.ts";

const evidence: EvidenceRecord[] = [
  {
    id: "shopify-product-rug",
    type: "shopify_product",
    source: "shopify:test",
    observedAt: "2026-08-16T00:00:00.000Z",
    summary: "Verified product",
    facts: {},
  },
];

test("accepts concepts whose claims cite known evidence", () => {
  assert.deepEqual(validateBatchGrounding(batch("shopify-product-rug"), evidence), []);
});

test("reports unknown concept and claim evidence", () => {
  const issues = validateBatchGrounding(batch("missing-evidence"), evidence);
  assert.equal(issues.length, 2);
});

function batch(evidenceId: string): CreativeBatch {
  return {
    batchName: "Test batch",
    accountState: "exploration",
    productHandle: "rug",
    concepts: [
      {
        id: "concept-01",
        template: "lifestyle_hero",
        evidenceTier: 1,
        segment: "Australian homeowners",
        motivation: "Finish the room",
        angle: "Room foundation",
        onImageHeadline: "Start From the Ground Up",
        body: "A grounded room starts with the right rug.",
        visualDescription: "A real rug in a warm room.",
        imagePrompt: "Preserve the supplied rug exactly.",
        preserveProduct: true,
        evidenceIds: [evidenceId],
        claims: [{ text: "Verified product", evidenceId }],
        meta: {
          primaryText: "A considered room starts from the ground up.",
          headline: "Find Your Foundation",
          description: "Shop the collection",
          cta: "SHOP_NOW",
        },
      },
    ],
  };
}
