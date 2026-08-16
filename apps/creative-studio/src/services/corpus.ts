import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { z } from "zod";

import type { CreativeStudioConfig } from "../config.ts";
import type { EvidenceRecord } from "../schemas.ts";

const WinningSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  path: z.string().min(1),
  performancePath: z.string().min(1),
  summary: z.string().min(1),
});

const WinningSourcesSchema = z.array(WinningSourceSchema);
const SOURCE_EXTENSIONS = new Set([".json", ".md", ".txt"]);

export interface CorpusStatus {
  adComments: number;
  customerReviews: number;
  winningAds: number;
}

export class CorpusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusError";
  }
}

export async function inspectCorpus(
  config: CreativeStudioConfig,
): Promise<CorpusStatus> {
  const base = resolve(config.repoRoot, "apps/creative-studio/inputs");
  const [reviews, comments, winningAds] = await Promise.all([
    countSourceFiles(resolve(base, "reviews")),
    countSourceFiles(resolve(base, "comments")),
    readWinningSources(config),
  ]);
  return {
    adComments: comments,
    customerReviews: reviews,
    winningAds: winningAds.length,
  };
}

export function assertGroundedCorpus(status: CorpusStatus): void {
  const missing: string[] = [];
  if (status.winningAds === 0) missing.push("inputs/winning-ads/sources.json");
  if (status.customerReviews === 0) missing.push("inputs/reviews/");
  if (missing.length > 0) {
    throw new CorpusError(
      `Creative generation is blocked until grounded inputs are added: ${missing.join(
        ", ",
      )}.`,
    );
  }
}

export async function loadCorpusEvidence(
  config: CreativeStudioConfig,
): Promise<EvidenceRecord[]> {
  const base = resolve(config.repoRoot, "apps/creative-studio/inputs");
  const observedAt = new Date().toISOString();
  const winning = await readWinningSources(config);
  const reviews = await readTextSources(resolve(base, "reviews"));
  const comments = await readTextSources(resolve(base, "comments"));

  return [
    ...winning.map((source) => ({
      id: source.id,
      type: "winning_ad" as const,
      source: source.path,
      observedAt,
      summary: source.summary,
      facts: { performancePath: source.performancePath },
    })),
    ...reviews.map((source, index) => ({
      id: `customer-review-${String(index + 1).padStart(3, "0")}`,
      type: "customer_review" as const,
      source: source.path,
      observedAt,
      summary: source.content,
      facts: { verbatim: source.content },
    })),
    ...comments.map((source, index) => ({
      id: `ad-comment-${String(index + 1).padStart(3, "0")}`,
      type: "ad_comment" as const,
      source: source.path,
      observedAt,
      summary: source.content,
      facts: { verbatim: source.content },
    })),
  ];
}

export async function loadExternalEvidence(
  config: CreativeStudioConfig,
): Promise<EvidenceRecord[]> {
  const directory = resolve(
    config.repoRoot,
    "apps/creative-studio/inputs/external-search",
  );
  const entries = await safeReadDirectory(directory);
  const records: EvidenceRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".json") continue;
    const payload = JSON.parse(
      await readFile(resolve(directory, entry.name), "utf8"),
    ) as unknown;
    const parsed = z.array(
      z.object({
        id: z.string(),
        type: z.literal("external_search"),
        source: z.string(),
        observedAt: z.string().datetime(),
        summary: z.string(),
        facts: z.record(z.unknown()),
      }),
    ).parse(payload);
    records.push(...parsed);
  }
  return records;
}

async function readWinningSources(
  config: CreativeStudioConfig,
): Promise<z.infer<typeof WinningSourcesSchema>> {
  const path = resolve(
    config.repoRoot,
    "apps/creative-studio/inputs/winning-ads/sources.json",
  );
  try {
    const parsed = WinningSourcesSchema.parse(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
    for (const source of parsed) {
      await readFile(resolve(config.repoRoot, source.path));
      await readFile(resolve(config.repoRoot, source.performancePath));
    }
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    return [];
  }
}

async function countSourceFiles(directory: string): Promise<number> {
  const entries = await safeReadDirectory(directory);
  return entries.filter(
    (entry) =>
      entry.isFile() &&
      entry.name.toLowerCase() !== "readme.md" &&
      SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()),
  ).length;
}

async function readTextSources(
  directory: string,
): Promise<Array<{ content: string; path: string }>> {
  const entries = await safeReadDirectory(directory);
  const files = entries.filter(
    (entry) =>
      entry.isFile() &&
      entry.name.toLowerCase() !== "readme.md" &&
      [".md", ".txt"].includes(extname(entry.name).toLowerCase()),
  );
  return Promise.all(
    files.map(async (entry) => ({
      path: resolve(directory, entry.name),
      content: (await readFile(resolve(directory, entry.name), "utf8")).trim(),
    })),
  );
}

async function safeReadDirectory(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
