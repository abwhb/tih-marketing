import { z } from "zod";

import type { RuntimeConfig } from "./config.ts";
import { HTTP_TIMEOUT_MS } from "./constants.ts";
import type { FileTokenStore } from "./token-store.ts";

const GraphQLErrorSchema = z.object({
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  extensions: z.record(z.unknown()).optional(),
});

const GraphQLResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(GraphQLErrorSchema).optional(),
  extensions: z.record(z.unknown()).optional(),
});

export type ShopifyGraphQLResponse = z.infer<typeof GraphQLResponseSchema>;

export class ShopifyApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

export class ShopifyAdminClient {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly tokenStore: FileTokenStore,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async execute(
    document: string,
    variables: Record<string, unknown> = {},
  ): Promise<ShopifyGraphQLResponse> {
    const session = await this.tokenStore.load();
    if (!session || session.shopDomain !== this.config.shopDomain) {
      throw new ShopifyApiError(
        "Shopify is not connected. Run the OAuth server and open /auth first.",
      );
    }
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
      throw new ShopifyApiError(
        "The stored Shopify token has expired. Complete OAuth again.",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://${this.config.shopDomain}/admin/api/${this.config.apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({ query: document, variables }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ShopifyApiError("The Shopify Admin API request timed out.");
      }
      throw new ShopifyApiError("Unable to reach the Shopify Admin API.");
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new ShopifyApiError(
          "Shopify rejected the stored token. Complete OAuth again.",
        );
      }
      if (response.status === 403) {
        throw new ShopifyApiError(
          "Shopify denied this operation. Check the app's granted scopes.",
        );
      }
      if (response.status === 429) {
        throw new ShopifyApiError(
          "Shopify rate-limited the request. Wait briefly and try again.",
        );
      }
      throw new ShopifyApiError(
        `Shopify returned HTTP ${response.status} for the Admin API request.`,
      );
    }

    const parsed = GraphQLResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ShopifyApiError(
        "Shopify returned an unexpected GraphQL response.",
      );
    }
    return parsed.data;
  }
}

export function getGraphQLData<T>(response: ShopifyGraphQLResponse): T {
  if (response.errors?.length) {
    throw new ShopifyApiError(
      response.errors.map((error) => error.message).join("; "),
    );
  }
  if (response.data === undefined || response.data === null) {
    throw new ShopifyApiError("Shopify returned no GraphQL data.");
  }
  return response.data as T;
}
