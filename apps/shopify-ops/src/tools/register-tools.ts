import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AuditLog } from "../audit-log.ts";
import type { RuntimeConfig } from "../config.ts";
import { MUTATION_CONFIRMATION } from "../constants.ts";
import { getOperationKind } from "../graphql-document.ts";
import {
  getGraphQLData,
  type ShopifyAdminClient,
} from "../shopify-client.ts";
import { toolFailure, toolSuccess } from "../tool-response.ts";

const ResponseFormatSchema = z.enum(["markdown", "json"]).default("markdown");
const VariablesSchema = z.record(z.unknown()).default({});

interface ConnectionData {
  currentAppInstallation: {
    accessScopes: Array<{ handle: string }>;
    id: string;
  };
  products: { nodes: Array<{ id: string }> };
  shop: {
    id: string;
    myshopifyDomain: string;
    name: string;
    primaryDomain: { url: string };
  };
}

interface ProductSearchData {
  products: {
    nodes: Array<{
      handle: string;
      id: string;
      onlineStoreUrl: string | null;
      productType: string;
      status: string;
      title: string;
      totalInventory: number;
      updatedAt: string;
      vendor: string;
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

interface OrderListData {
  orders: {
    nodes: Array<{
      createdAt: string;
      currentTotalPriceSet: {
        shopMoney: { amount: string; currencyCode: string };
      };
      displayFinancialStatus: string | null;
      displayFulfillmentStatus: string;
      id: string;
      name: string;
      sourceName: string;
      tags: string[];
      updatedAt: string;
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

export interface ToolDependencies {
  auditLog: AuditLog;
  client: ShopifyAdminClient;
  config: RuntimeConfig;
}

export function registerShopifyTools(
  server: McpServer,
  dependencies: ToolDependencies,
): void {
  const { auditLog, client, config } = dependencies;

  server.registerTool(
    "shopify_connection_status",
    {
      title: "Check Shopify Connection",
      description:
        "Verify the stored Shopify OAuth token, identify the connected shop, list granted scopes, and confirm product-read access.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const response = await client.execute(`
          query TihConnectionStatus {
            shop {
              id
              name
              myshopifyDomain
              primaryDomain { url }
            }
            currentAppInstallation {
              id
              accessScopes { handle }
            }
            products(first: 1) { nodes { id } }
          }
        `);
        const data = getGraphQLData<ConnectionData>(response);
        const result = {
          connected: true,
          shop: data.shop,
          appInstallationId: data.currentAppInstallation.id,
          grantedScopes: data.currentAppInstallation.accessScopes
            .map(({ handle }) => handle)
            .sort(),
          productReadPassed: Array.isArray(data.products.nodes),
        };
        return toolSuccess(
          result,
          `# Shopify connection\n\n- **Store:** ${data.shop.name}\n- **Domain:** ${data.shop.myshopifyDomain}\n- **Granted scopes:** ${result.grantedScopes.length}\n- **Product read:** Passed`,
          "markdown",
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "shopify_search_products",
    {
      title: "Search Shopify Products",
      description:
        "Search products using Shopify search syntax. Returns a cursor for the next page and core merchandising fields without modifying the store.",
      inputSchema: {
        query: z.string().max(500).optional().describe("Shopify product search query."),
        limit: z.number().int().min(1).max(50).default(20),
        after: z.string().max(1_000).optional().describe("Pagination cursor."),
        response_format: ResponseFormatSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit, after, response_format }) => {
      try {
        const response = await client.execute(
          `
            query TihSearchProducts($first: Int!, $after: String, $query: String) {
              products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
                nodes {
                  id title handle status vendor productType updatedAt
                  totalInventory onlineStoreUrl
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
          {
            first: limit,
            after: after ?? null,
            query: query?.trim() || null,
          },
        );
        const data = getGraphQLData<ProductSearchData>(response);
        const result = {
          count: data.products.nodes.length,
          products: data.products.nodes,
          hasMore: data.products.pageInfo.hasNextPage,
          nextCursor: data.products.pageInfo.endCursor,
        };
        const markdown = [
          "# Shopify products",
          "",
          ...result.products.map(
            (product) =>
              `- **${product.title}** — ${product.status}; inventory ${product.totalInventory}; \`${product.handle}\``,
          ),
          "",
          result.hasMore ? `Next cursor: \`${result.nextCursor}\`` : "No more results.",
        ].join("\n");
        return toolSuccess(result, markdown, response_format);
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "shopify_list_orders",
    {
      title: "List Shopify Orders",
      description:
        "List recent orders for marketing and attribution analysis without returning customer contact details. Supports Shopify order-search syntax and cursor pagination.",
      inputSchema: {
        query: z.string().max(500).optional().describe("Shopify order search query."),
        limit: z.number().int().min(1).max(50).default(20),
        after: z.string().max(1_000).optional().describe("Pagination cursor."),
        response_format: ResponseFormatSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit, after, response_format }) => {
      try {
        const response = await client.execute(
          `
            query TihListOrders($first: Int!, $after: String, $query: String) {
              orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
                nodes {
                  id name createdAt updatedAt sourceName tags
                  displayFinancialStatus displayFulfillmentStatus
                  currentTotalPriceSet { shopMoney { amount currencyCode } }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
          {
            first: limit,
            after: after ?? null,
            query: query?.trim() || null,
          },
        );
        const data = getGraphQLData<OrderListData>(response);
        const result = {
          count: data.orders.nodes.length,
          orders: data.orders.nodes,
          hasMore: data.orders.pageInfo.hasNextPage,
          nextCursor: data.orders.pageInfo.endCursor,
        };
        const markdown = [
          "# Shopify orders",
          "",
          ...result.orders.map((order) => {
            const money = order.currentTotalPriceSet.shopMoney;
            return `- **${order.name}** — ${money.currencyCode} ${money.amount}; ${order.displayFinancialStatus ?? "UNKNOWN"}; ${order.createdAt}`;
          }),
          "",
          result.hasMore ? `Next cursor: \`${result.nextCursor}\`` : "No more results.",
        ].join("\n");
        return toolSuccess(result, markdown, response_format);
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "shopify_graphql_query",
    {
      title: "Run Shopify GraphQL Query",
      description:
        "Run an arbitrary read-only GraphQL Admin API query. This is the unrestricted read escape hatch for resources not covered by focused tools.",
      inputSchema: {
        document: z.string().min(1).max(50_000),
        variables: VariablesSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ document, variables }) => {
      try {
        if (getOperationKind(document) !== "query") {
          throw new Error(
            "This tool accepts query operations only. Use shopify_graphql_mutation for mutations.",
          );
        }
        const response = await client.execute(document, variables);
        return toolSuccess({ response });
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "shopify_graphql_mutation",
    {
      title: "Run Shopify GraphQL Mutation",
      description: `Run an arbitrary GraphQL Admin API mutation. This can modify or delete Shopify data. The caller must pass confirmation exactly as ${MUTATION_CONFIRMATION}. Every attempt is audit logged without variable values.`,
      inputSchema: {
        document: z.string().min(1).max(50_000),
        variables: VariablesSchema,
        confirmation: z.literal(MUTATION_CONFIRMATION),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ document, variables }) => {
      if (getOperationKind(document) !== "mutation") {
        return toolFailure(
          new Error("This tool accepts explicit mutation operations only."),
        );
      }

      try {
        const response = await client.execute(document, variables);
        await auditLog.record({
          document,
          variables,
          shopDomain: config.shopDomain,
          outcome: response.errors?.length ? "error" : "success",
        });
        return toolSuccess({ response });
      } catch (error) {
        await auditLog.record({
          document,
          variables,
          shopDomain: config.shopDomain,
          outcome: "error",
        });
        return toolFailure(error);
      }
    },
  );
}
