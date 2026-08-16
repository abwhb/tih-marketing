import { loadConfig, requireDataForSeoAuthorization, requireGeminiKey } from "./config.ts";
import { DataForSeoClient } from "./providers/dataforseo.ts";
import { GeminiClient } from "./providers/gemini.ts";
import { ShopifyEvidenceClient } from "./providers/shopify.ts";
import { generateCreativeBatch } from "./services/batch.ts";
import { brandClaimEvidence, loadBrandTokens } from "./services/brand.ts";
import {
  assertGroundedCorpus,
  inspectCorpus,
  loadCorpusEvidence,
  loadExternalEvidence,
} from "./services/corpus.ts";
import {
  writeCreativeBatch,
  writeEvidencePack,
  writeExternalSearchEvidence,
} from "./services/output.ts";
import { renderConceptImage } from "./services/render.ts";
import type { EvidenceRecord } from "./schemas.ts";

const config = loadConfig();
const command = process.argv[2] ?? "help";

try {
  if (command === "preflight") await preflight();
  else if (command === "prepare") await prepare();
  else if (command === "research") await research();
  else if (command === "generate") await generate();
  else if (command === "render") await render();
  else printHelp();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown creative-studio error.";
  console.error(`Creative Studio: ${message}`);
  process.exitCode = 1;
}

async function preflight(): Promise<void> {
  const brand = await loadBrandTokens(config);
  const corpus = await inspectCorpus(config);
  const gemini = createGemini();
  const dataForSeo = new DataForSeoClient(requireDataForSeoAuthorization(config));
  const [geminiStatus, dataForSeoStatus] = await Promise.all([
    gemini.checkConnection(),
    dataForSeo.checkConnection(),
  ]);
  console.log(
    JSON.stringify(
      {
        brand: { name: brand.brandName, valid: true },
        corpus,
        dataForSeo: dataForSeoStatus,
        gemini: geminiStatus,
        chatGptOrchestration: config.openAiApiKey
          ? "OpenAI API key available"
          : "Use this ChatGPT/Codex task; OPENAI_API_KEY is optional",
        generationReady: corpus.winningAds > 0 && corpus.customerReviews > 0,
      },
      null,
      2,
    ),
  );
}

async function prepare(): Promise<void> {
  const productHandle = requiredOption("product");
  const [brand, productEvidence, corpusEvidence, externalEvidence] = await Promise.all([
    loadBrandTokens(config),
    new ShopifyEvidenceClient(config).collectProductEvidence(productHandle),
    loadCorpusEvidence(config),
    loadExternalEvidence(config),
  ]);
  const evidence = [
    ...productEvidence,
    ...brandClaimEvidence(brand),
    ...corpusEvidence,
    ...externalEvidence,
  ];
  const paths = await writeEvidencePack({ config, evidence, productHandle });
  console.log(JSON.stringify({ evidenceCount: evidence.length, ...paths }, null, 2));
}

async function research(): Promise<void> {
  const keywords = requiredOption("keywords")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const limit = numberOption("limit", 25, 1, 100);
  const client = new DataForSeoClient(requireDataForSeoAuthorization(config));
  const ideas = await client.keywordIdeas(keywords, limit);
  const observedAt = new Date().toISOString();
  const evidence: EvidenceRecord[] = ideas.map((idea, index) => ({
    id: `external-search-${String(index + 1).padStart(3, "0")}`,
    type: "external_search",
    source: "DataForSEO Labs Google keyword ideas — Australia, English",
    observedAt,
    summary: `${idea.keyword}: ${idea.searchVolume ?? "unknown"} monthly searches`,
    facts: { ...idea },
  }));
  const path = await writeExternalSearchEvidence({
    config,
    evidence,
    stem: keywords.join("-"),
  });
  console.log(JSON.stringify({ ideas: ideas.length, output: path }, null, 2));
}

async function generate(): Promise<void> {
  const productHandle = requiredOption("product");
  const count = numberOption("count", 6, 1, 15);
  const accountState = option("account-state") === "scaling" ? "scaling" : "exploration";
  const corpusStatus = await inspectCorpus(config);
  assertGroundedCorpus(corpusStatus);
  const [brand, productEvidence, corpusEvidence, externalEvidence] = await Promise.all([
    loadBrandTokens(config),
    new ShopifyEvidenceClient(config).collectProductEvidence(productHandle),
    loadCorpusEvidence(config),
    loadExternalEvidence(config),
  ]);
  const evidence = [
    ...productEvidence,
    ...brandClaimEvidence(brand),
    ...corpusEvidence,
    ...externalEvidence,
  ];
  const batch = await generateCreativeBatch({
    accountState,
    brand,
    count,
    evidence,
    gemini: createGemini(),
    productHandle,
  });
  const paths = await writeCreativeBatch({ batch, config, evidence });
  console.log(JSON.stringify({ concepts: batch.concepts.length, ...paths }, null, 2));
}

async function render(): Promise<void> {
  const batchPath = requiredOption("batch");
  const conceptId = requiredOption("concept");
  const path = await renderConceptImage({
    batchPath,
    conceptId,
    config,
    gemini: createGemini(),
  });
  console.log(JSON.stringify({ conceptId, image: path }, null, 2));
}

function createGemini(): GeminiClient {
  return new GeminiClient({
    apiKey: requireGeminiKey(config),
    imageModel: config.geminiImageModel,
    textModel: config.geminiTextModel,
  });
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredOption(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`Missing required option --${name}=...`);
  return value;
}

function numberOption(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = option(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`TIH Creative Studio

pnpm preflight
pnpm evidence -- --product=maleny-beige-jute-rug
pnpm research -- --keywords="jute rugs,wool rugs" --limit=25
pnpm generate -- --product=maleny-beige-jute-rug --count=6 --account-state=exploration
pnpm render -- --batch=/absolute/path/to/batch.json --concept=concept-01

The research command calls a billable DataForSEO live endpoint. Generation remains
blocked until real customer-review inputs are present.`);
}
