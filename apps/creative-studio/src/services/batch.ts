import type { BrandTokens, CreativeBatch, EvidenceRecord } from "../schemas.ts";
import {
  CreativeBatchSchema,
  GEMINI_CREATIVE_BATCH_RESPONSE_SCHEMA,
  StaticTemplateSchema,
} from "../schemas.ts";
import type { GeminiClient } from "../providers/gemini.ts";
import { validateBatchGrounding } from "./validation.ts";

export async function generateCreativeBatch(args: {
  accountState: "exploration" | "scaling";
  brand: BrandTokens;
  count: number;
  evidence: EvidenceRecord[];
  gemini: GeminiClient;
  productHandle: string;
}): Promise<CreativeBatch> {
  const prompt = createBatchPrompt(args);
  const raw = await args.gemini.generateJson<unknown>(
    prompt,
    GEMINI_CREATIVE_BATCH_RESPONSE_SCHEMA,
  );
  const batch = CreativeBatchSchema.parse(raw);
  if (batch.concepts.length !== args.count) {
    throw new Error(
      `Gemini returned ${batch.concepts.length} concepts; expected ${args.count}.`,
    );
  }
  const issues = validateBatchGrounding(batch, args.evidence);
  if (issues.length > 0) {
    throw new Error(
      `Generated batch failed grounding: ${issues
        .map((issue) => `${issue.conceptId}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return batch;
}

function createBatchPrompt(args: {
  accountState: "exploration" | "scaling";
  brand: BrandTokens;
  count: number;
  evidence: EvidenceRecord[];
  productHandle: string;
}): string {
  const templates = StaticTemplateSchema.options.join(", ");
  return [
    "You are preparing source-grounded Meta static-ad concepts for The Inspire Home.",
    `Return exactly ${args.count} concepts for product handle ${args.productHandle}.`,
    `The account is in ${args.accountState} state.`,
    "Use Australian English and the supplied brand specification.",
    "Each concept must test a genuinely different segment × motivation × angle × template cell.",
    "Do not produce cosmetic rewrites of one idea.",
    `Available templates: ${templates}.`,
    "Do not use press_mention without press evidence, competitor_callout without substantiated comparison evidence, or social-proof claims without real customer-review evidence.",
    "Every factual claim must cite one exact evidence ID. Never invent a price, product property, inventory count, result, statistic, testimonial, certification, offer or deadline.",
    "Product imagery must preserve the rug pattern, colour, material appearance, edge and proportions. Set preserveProduct to true.",
    "The image prompt should describe a product-preserving edit using the real Shopify product image as a reference; do not request text baked into the generated product image because Canva adds final typography.",
    "Meta copy limits are strict: headline <=40 characters, description <=30 characters, primary text <=2200 characters.",
    "Concept IDs must be concept-01, concept-02 and so on.",
    "Brand specification:",
    JSON.stringify(args.brand),
    "Evidence records:",
    JSON.stringify(args.evidence),
  ].join("\n\n");
}
