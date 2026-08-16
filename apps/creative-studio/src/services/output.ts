import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CreativeStudioConfig } from "../config.ts";
import type { CreativeBatch, EvidenceRecord } from "../schemas.ts";

export async function writeEvidencePack(args: {
  config: CreativeStudioConfig;
  evidence: EvidenceRecord[];
  productHandle: string;
}): Promise<{ briefPath: string; evidencePath: string }> {
  const directory = resolve(args.config.repoRoot, "apps/creative-studio/outputs/prepared");
  await mkdir(directory, { recursive: true });
  const stem = `${dateStamp()}-${slugify(args.productHandle)}`;
  const evidencePath = resolve(directory, `${stem}.json`);
  const briefPath = resolve(directory, `${stem}-chatgpt-brief.md`);
  await writeFile(evidencePath, `${JSON.stringify(args.evidence, null, 2)}\n`, "utf8");
  await writeFile(
    briefPath,
    [
      `# ChatGPT Creative Brief — ${args.productHandle}`,
      "",
      "Use the repository ad-creative skill and brand specification. Rank angle hypotheses by evidence strength. Do not invent facts or create testimonial concepts without stored review evidence.",
      "",
      "## Evidence IDs",
      "",
      ...args.evidence.map(
        (record) => `- \`${record.id}\` — ${record.type}: ${record.summary}`,
      ),
      "",
      `Machine-readable evidence: \`${evidencePath}\``,
      "",
    ].join("\n"),
    "utf8",
  );
  return { briefPath, evidencePath };
}

export async function writeCreativeBatch(args: {
  batch: CreativeBatch;
  config: CreativeStudioConfig;
  evidence: EvidenceRecord[];
}): Promise<{ canvaPath: string; directory: string; indexPath: string }> {
  const directory = resolve(
    args.config.repoRoot,
    "apps/creative-studio/outputs",
    dateStamp(),
    slugify(args.batch.batchName),
  );
  await mkdir(resolve(directory, "concepts"), { recursive: true });
  await mkdir(resolve(directory, "images"), { recursive: true });

  await writeFile(
    resolve(directory, "batch.json"),
    `${JSON.stringify({ batch: args.batch, evidence: args.evidence }, null, 2)}\n`,
    "utf8",
  );
  for (const concept of args.batch.concepts) {
    await writeFile(
      resolve(directory, "concepts", `${concept.id}.md`),
      conceptMarkdown(concept),
      "utf8",
    );
  }

  const indexPath = resolve(directory, "INDEX.md");
  await writeFile(
    indexPath,
    [
      `# ${args.batch.batchName}`,
      "",
      `Account state: ${args.batch.accountState}`,
      "",
      "| Concept | Template | Angle | Evidence |",
      "|---|---|---|---|",
      ...args.batch.concepts.map(
        (concept) =>
          `| ${concept.id} | ${concept.template} | ${concept.angle} | ${concept.evidenceIds.join(", ")} |`,
      ),
      "",
    ].join("\n"),
    "utf8",
  );

  const canvaPath = resolve(directory, "canva-handoff.json");
  await writeFile(
    canvaPath,
    `${JSON.stringify(
      {
        needsTemplateMapping: true,
        requiredFields: [
          "headline",
          "body",
          "cta",
          "product_name",
          "product_image",
        ],
        designs: args.batch.concepts.map((concept) => ({
          title: `TIH ${concept.id} ${concept.angle}`,
          conceptId: concept.id,
          template: concept.template,
          data: {
            headline: concept.onImageHeadline,
            body: concept.body,
            cta: concept.meta.cta.replaceAll("_", " "),
            product_name: args.batch.productHandle,
          },
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { canvaPath, directory, indexPath };
}

export async function writeExternalSearchEvidence(args: {
  config: CreativeStudioConfig;
  evidence: EvidenceRecord[];
  stem: string;
}): Promise<string> {
  const directory = resolve(
    args.config.repoRoot,
    "apps/creative-studio/inputs/external-search",
  );
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${dateStamp()}-${slugify(args.stem)}.json`);
  await writeFile(path, `${JSON.stringify(args.evidence, null, 2)}\n`, "utf8");
  return path;
}

function conceptMarkdown(concept: CreativeBatch["concepts"][number]): string {
  return [
    `# ${concept.id}: ${concept.angle}`,
    "",
    `- Template: ${concept.template}`,
    `- Evidence tier: ${concept.evidenceTier}`,
    `- Segment: ${concept.segment}`,
    `- Motivation: ${concept.motivation}`,
    `- Grounded in: ${concept.evidenceIds.join(", ")}`,
    "",
    `## Headline\n\n${concept.onImageHeadline}`,
    "",
    `## Body\n\n${concept.body}`,
    "",
    `## Visual\n\n${concept.visualDescription}`,
    "",
    `## Gemini image prompt\n\n${concept.imagePrompt}`,
    "",
    "## Meta copy",
    "",
    `- Primary text: ${concept.meta.primaryText}`,
    `- Headline: ${concept.meta.headline}`,
    `- Description: ${concept.meta.description}`,
    `- CTA: ${concept.meta.cta}`,
    "",
    "## Claims",
    "",
    ...concept.claims.map((claim) => `- ${claim.text} — \`${claim.evidenceId}\``),
    "",
  ].join("\n");
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
