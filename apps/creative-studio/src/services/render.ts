import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import type { CreativeStudioConfig } from "../config.ts";
import type { GeminiClient } from "../providers/gemini.ts";
import { CreativeBatchSchema, EvidenceRecordSchema } from "../schemas.ts";

const BatchArtifactSchema = z.object({
  batch: CreativeBatchSchema,
  evidence: z.array(EvidenceRecordSchema),
});

export async function renderConceptImage(args: {
  batchPath: string;
  conceptId: string;
  config: CreativeStudioConfig;
  gemini: GeminiClient;
}): Promise<string> {
  const batchPath = resolve(args.batchPath);
  const allowedRoot = resolve(args.config.repoRoot, "apps/creative-studio/outputs");
  if (batchPath !== allowedRoot && !batchPath.startsWith(`${allowedRoot}/`)) {
    throw new Error("Batch path must be inside apps/creative-studio/outputs.");
  }
  const artifact = BatchArtifactSchema.parse(
    JSON.parse(await readFile(batchPath, "utf8")) as unknown,
  );
  const concept = artifact.batch.concepts.find(({ id }) => id === args.conceptId);
  if (!concept) throw new Error(`Concept not found: ${args.conceptId}`);

  const productEvidence = artifact.evidence.find(
    ({ type, facts }) =>
      type === "shopify_product" && facts.handle === artifact.batch.productHandle,
  );
  const featuredImage = productEvidence?.facts.featuredImage;
  const imageUrl =
    typeof featuredImage === "object" &&
    featuredImage !== null &&
    "url" in featuredImage &&
    typeof featuredImage.url === "string"
      ? featuredImage.url
      : null;
  if (!imageUrl) {
    throw new Error("The batch contains no verified Shopify featured image.");
  }

  const sourceResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!sourceResponse.ok) {
    throw new Error(`Unable to download Shopify product image: HTTP ${sourceResponse.status}`);
  }
  const mimeType = sourceResponse.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Shopify featured image returned a non-image content type.");
  }
  const reference = Buffer.from(await sourceResponse.arrayBuffer());
  const generated = await args.gemini.generateImage(
    [
      concept.imagePrompt,
      "Use the supplied Shopify product image as the immutable product reference.",
      "Preserve the exact rug pattern, colours, material texture, border, pile and proportions.",
      "Create a 4:5 portrait Meta feed composition designed for 1080x1350 output.",
      "Do not add logos, headlines, captions, prices or other text; Canva will add typography.",
    ].join("\n"),
    [{ data: reference, mimeType }],
  );
  const extension = generated.mimeType === "image/jpeg" ? "jpg" : "png";
  const outputPath = resolve(dirname(batchPath), "images", `${concept.id}.${extension}`);
  await writeFile(outputPath, generated.data);
  return outputPath;
}
