import { resolve } from "node:path";

import { z } from "zod";

const EnvSchema = z.object({
  DATAFORSEO: z.string().trim().optional(),
  DATAFORSEO_LOGIN: z.string().trim().optional(),
  DATAFORSEO_PASSWORD: z.string().trim().optional(),
  GEMINI: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_IMAGE_MODEL: z.string().trim().default("gemini-3.1-flash-image"),
  GEMINI_TEXT_MODEL: z.string().trim().default("gemini-3.6-flash"),
  OPENAI_API_KEY: z.string().trim().optional(),
  SHOPIFY_API_VERSION: z.string().trim().regex(/^\d{4}-(01|04|07|10)$/),
  SHOPIFY_STORE_DOMAIN: z.string().trim(),
  SHOPIFY_TOKEN_STORE_PATH: z.string().trim().optional(),
  TIH_REPO_ROOT: z.string().trim().optional(),
});

export interface CreativeStudioConfig {
  dataForSeoAuthorization?: string;
  geminiApiKey?: string;
  geminiImageModel: string;
  geminiTextModel: string;
  openAiApiKey?: string;
  repoRoot: string;
  shopifyApiVersion: string;
  shopifyStoreDomain: string;
  shopifyTokenStorePath: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): CreativeStudioConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ConfigurationError(`Missing or invalid environment values: ${keys}`);
  }

  const data = parsed.data;
  const repoRoot = data.TIH_REPO_ROOT
    ? resolve(data.TIH_REPO_ROOT)
    : resolve(workingDirectory, "../..");
  const dataForSeoAuthorization = resolveDataForSeoAuthorization(data);
  const geminiApiKey = data.GEMINI_API_KEY || data.GEMINI;

  return {
    ...(dataForSeoAuthorization ? { dataForSeoAuthorization } : {}),
    ...(geminiApiKey ? { geminiApiKey } : {}),
    ...(data.OPENAI_API_KEY ? { openAiApiKey: data.OPENAI_API_KEY } : {}),
    geminiImageModel: data.GEMINI_IMAGE_MODEL,
    geminiTextModel: data.GEMINI_TEXT_MODEL,
    repoRoot,
    shopifyApiVersion: data.SHOPIFY_API_VERSION,
    shopifyStoreDomain: normalizeShopDomain(data.SHOPIFY_STORE_DOMAIN),
    shopifyTokenStorePath: data.SHOPIFY_TOKEN_STORE_PATH
      ? resolve(data.SHOPIFY_TOKEN_STORE_PATH)
      : resolve(repoRoot, "apps/shopify-ops/.data/shopify-session.json"),
  };
}

export function requireGeminiKey(config: CreativeStudioConfig): string {
  if (!config.geminiApiKey) {
    throw new ConfigurationError("Set GEMINI or GEMINI_API_KEY in the repository .env file.");
  }
  return config.geminiApiKey;
}

export function requireDataForSeoAuthorization(
  config: CreativeStudioConfig,
): string {
  if (!config.dataForSeoAuthorization) {
    throw new ConfigurationError(
      "Set DATAFORSEO or both DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.",
    );
  }
  return config.dataForSeoAuthorization;
}

function resolveDataForSeoAuthorization(
  data: z.infer<typeof EnvSchema>,
): string | undefined {
  if (data.DATAFORSEO) {
    const decoded = Buffer.from(data.DATAFORSEO, "base64").toString("utf8");
    if (!decoded.includes(":")) {
      throw new ConfigurationError(
        "DATAFORSEO must be a Base64-encoded login:password credential.",
      );
    }
    return `Basic ${data.DATAFORSEO}`;
  }

  if (data.DATAFORSEO_LOGIN && data.DATAFORSEO_PASSWORD) {
    const encoded = Buffer.from(
      `${data.DATAFORSEO_LOGIN}:${data.DATAFORSEO_PASSWORD}`,
      "utf8",
    ).toString("base64");
    return `Basic ${encoded}`;
  }

  if (data.DATAFORSEO_LOGIN || data.DATAFORSEO_PASSWORD) {
    throw new ConfigurationError(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set together.",
    );
  }
  return undefined;
}

function normalizeShopDomain(value: string): string {
  const domain = value
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new ConfigurationError(
      "SHOPIFY_STORE_DOMAIN must be the canonical *.myshopify.com domain.",
    );
  }
  return domain;
}
