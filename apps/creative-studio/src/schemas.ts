import { z } from "zod";

export const EvidenceTypeSchema = z.enum([
  "shopify_product",
  "shopify_paid_orders",
  "website_claim",
  "meta_performance",
  "customer_review",
  "ad_comment",
  "external_search",
  "winning_ad",
]);

export const EvidenceRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: EvidenceTypeSchema,
  source: z.string().min(1),
  observedAt: z.string().datetime(),
  summary: z.string().min(1),
  facts: z.record(z.unknown()).default({}),
});

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const StaticTemplateSchema = z.enum([
  "headline_statement",
  "us_vs_them",
  "stat_callout",
  "review_card",
  "testimonial_stack",
  "before_after",
  "problem_solution",
  "founder_message",
  "feature_spotlight",
  "press_mention",
  "lifestyle_hero",
  "numbered_list",
  "faq_card",
  "competitor_callout",
  "origin_story",
]);

export const MetaCopySchema = z.object({
  primaryText: z.string().min(1).max(2_200),
  headline: z.string().min(1).max(40),
  description: z.string().max(30),
  cta: z.enum(["SHOP_NOW", "LEARN_MORE", "GET_OFFER", "SEND_MESSAGE"]),
});

export const ClaimSchema = z.object({
  text: z.string().min(1),
  evidenceId: z.string().min(1),
});

export const CreativeConceptSchema = z.object({
  id: z.string().regex(/^concept-[0-9]{2}$/),
  template: StaticTemplateSchema,
  evidenceTier: z.number().int().min(1).max(6),
  segment: z.string().min(1),
  motivation: z.string().min(1),
  angle: z.string().min(1),
  onImageHeadline: z.string().min(1).max(90),
  body: z.string().max(320),
  visualDescription: z.string().min(1),
  imagePrompt: z.string().min(1),
  preserveProduct: z.literal(true),
  evidenceIds: z.array(z.string()).min(1),
  claims: z.array(ClaimSchema),
  meta: MetaCopySchema,
});

export const CreativeBatchSchema = z.object({
  batchName: z.string().min(1),
  accountState: z.enum(["exploration", "scaling"]),
  productHandle: z.string().min(1),
  concepts: z.array(CreativeConceptSchema).min(1).max(50),
});

export type CreativeBatch = z.infer<typeof CreativeBatchSchema>;
export type CreativeConcept = z.infer<typeof CreativeConceptSchema>;

export const BrandTokensSchema = z.object({
  schemaVersion: z.literal(1),
  brandName: z.string(),
  locale: z.literal("en-AU"),
  website: z.string().url(),
  logoUrls: z.record(z.string().url()),
  colours: z.record(z.string().regex(/^#[0-9A-F]{6}$/i)),
  typography: z.record(z.union([z.string(), z.array(z.string())])),
  voice: z.object({
    traits: z.array(z.string()),
    preferredTerms: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  verifiedGlobalClaims: z.array(z.string()),
  restrictedClaims: z.array(z.string()),
  creativeRules: z.array(z.string()),
});

export type BrandTokens = z.infer<typeof BrandTokensSchema>;

export const GEMINI_CREATIVE_BATCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    batchName: { type: "string" },
    accountState: { type: "string", enum: ["exploration", "scaling"] },
    productHandle: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          template: { type: "string", enum: StaticTemplateSchema.options },
          evidenceTier: { type: "integer", minimum: 1, maximum: 6 },
          segment: { type: "string" },
          motivation: { type: "string" },
          angle: { type: "string" },
          onImageHeadline: { type: "string" },
          body: { type: "string" },
          visualDescription: { type: "string" },
          imagePrompt: { type: "string" },
          preserveProduct: { type: "boolean" },
          evidenceIds: { type: "array", items: { type: "string" } },
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                evidenceId: { type: "string" },
              },
              required: ["text", "evidenceId"],
            },
          },
          meta: {
            type: "object",
            properties: {
              primaryText: { type: "string" },
              headline: { type: "string" },
              description: { type: "string" },
              cta: {
                type: "string",
                enum: ["SHOP_NOW", "LEARN_MORE", "GET_OFFER", "SEND_MESSAGE"],
              },
            },
            required: ["primaryText", "headline", "description", "cta"],
          },
        },
        required: [
          "id",
          "template",
          "evidenceTier",
          "segment",
          "motivation",
          "angle",
          "onImageHeadline",
          "body",
          "visualDescription",
          "imagePrompt",
          "preserveProduct",
          "evidenceIds",
          "claims",
          "meta",
        ],
      },
    },
  },
  required: ["batchName", "accountState", "productHandle", "concepts"],
} as const;
