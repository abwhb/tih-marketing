import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import type { CreativeStudioConfig } from "../src/config.ts";
import {
  assertGroundedCorpus,
  CorpusError,
  inspectCorpus,
} from "../src/services/corpus.ts";

test("ignores README files and counts sourced inputs", async (context) => {
  const repoRoot = await mkdtemp(resolve(tmpdir(), "tih-creative-studio-"));
  context.after(async () => rm(repoRoot, { force: true, recursive: true }));
  const inputRoot = resolve(repoRoot, "apps/creative-studio/inputs");
  await mkdir(resolve(inputRoot, "reviews"), { recursive: true });
  await mkdir(resolve(inputRoot, "comments"), { recursive: true });
  await mkdir(resolve(inputRoot, "winning-ads"), { recursive: true });
  await mkdir(resolve(repoRoot, "assets"), { recursive: true });
  await writeFile(resolve(inputRoot, "reviews/README.md"), "instructions");
  await writeFile(resolve(inputRoot, "reviews/review-01.md"), "Real review");
  await writeFile(resolve(repoRoot, "assets/ad.png"), "image");
  await writeFile(resolve(repoRoot, "assets/report.md"), "report");
  await writeFile(
    resolve(inputRoot, "winning-ads/sources.json"),
    JSON.stringify([
      {
        id: "winning-ad-01",
        path: "assets/ad.png",
        performancePath: "assets/report.md",
        summary: "Sourced winner",
      },
    ]),
  );

  const status = await inspectCorpus(configFor(repoRoot));
  assert.deepEqual(status, {
    adComments: 0,
    customerReviews: 1,
    winningAds: 1,
  });
  assert.doesNotThrow(() => assertGroundedCorpus(status));
});

test("blocks generation without customer reviews", () => {
  assert.throws(
    () => assertGroundedCorpus({ adComments: 0, customerReviews: 0, winningAds: 1 }),
    CorpusError,
  );
});

function configFor(repoRoot: string): CreativeStudioConfig {
  return {
    geminiImageModel: "image",
    geminiTextModel: "text",
    repoRoot,
    shopifyApiVersion: "2026-07",
    shopifyStoreDomain: "new-rug-store.myshopify.com",
    shopifyTokenStorePath: resolve(repoRoot, "session.json"),
  };
}
