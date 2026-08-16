import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { CreativeStudioConfig } from "../config.ts";
import type { EvidenceRecord } from "../schemas.ts";

const SessionSchema = z.object({
  accessToken: z.string().min(1),
  shopDomain: z.string().min(1),
});

export class ShopifyEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyEvidenceError";
  }
}

export class ShopifyEvidenceClient {
  constructor(
    private readonly config: CreativeStudioConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async collectProductEvidence(handle: string): Promise<EvidenceRecord[]> {
    const session = await this.loadSession();
    const createdAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    const response = await this.graphql<ShopifyEvidenceData>(session.accessToken, QUERY, {
      handle,
      ordersQuery: `created_at:>=${createdAfter}`,
    });
    if (!response.product) {
      throw new ShopifyEvidenceError(`Shopify product not found: ${handle}`);
    }

    const paidOrders = response.orders.nodes.filter(isPaidOrder);
    const productOrders = paidOrders.filter((order) =>
      order.lineItems.nodes.some((item) => item.product?.handle === handle),
    );
    const productUnits = productOrders.reduce(
      (total, order) =>
        total +
        order.lineItems.nodes
          .filter((item) => item.product?.handle === handle)
          .reduce((sum, item) => sum + item.currentQuantity, 0),
      0,
    );
    const paidOrderValue = productOrders.reduce(
      (total, order) => total + Number(order.currentTotalPriceSet.shopMoney.amount),
      0,
    );
    const observedAt = new Date().toISOString();
    const product = response.product;

    return [
      {
        id: `shopify-product-${slugify(handle)}`,
        type: "shopify_product",
        source: product.onlineStoreUrl ?? `shopify:${product.id}`,
        observedAt,
        summary: `${product.title} is ${product.status.toLowerCase()} with ${product.totalInventory} units across ${product.variants.nodes.length} variants.`,
        facts: {
          title: product.title,
          handle: product.handle,
          description: product.description,
          productType: product.productType,
          tags: product.tags,
          status: product.status,
          totalInventory: product.totalInventory,
          onlineStoreUrl: product.onlineStoreUrl,
          featuredImage: product.featuredImage,
          variants: product.variants.nodes.map((variant) => ({
            title: variant.title,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            inventoryQuantity: variant.inventoryQuantity,
            selectedOptions: variant.selectedOptions,
          })),
        },
      },
      {
        id: `shopify-paid-orders-${slugify(handle)}-30d`,
        type: "shopify_paid_orders",
        source: "Shopify Admin API paid-order aggregate",
        observedAt,
        summary: `${product.title} appeared in ${productOrders.length} paid orders and ${productUnits} paid units during the trailing 30 days.`,
        facts: {
          paidOrders: productOrders.length,
          paidUnits: productUnits,
          paidOrderValue: Number(paidOrderValue.toFixed(2)),
          currencyCode:
            productOrders[0]?.currentTotalPriceSet.shopMoney.currencyCode ?? "AUD",
          filter:
            "Non-test, non-cancelled, positive received amount, financial status PAID or PARTIALLY_REFUNDED",
        },
      },
    ];
  }

  private async loadSession(): Promise<z.infer<typeof SessionSchema>> {
    let raw: string;
    try {
      raw = await readFile(this.config.shopifyTokenStorePath, "utf8");
    } catch {
      throw new ShopifyEvidenceError(
        "Unable to read the local Shopify session. Run shopify-ops sync-token.",
      );
    }
    const parsed = SessionSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success || parsed.data.shopDomain !== this.config.shopifyStoreDomain) {
      throw new ShopifyEvidenceError("The local Shopify session is invalid or for another shop.");
    }
    return parsed.data;
  }

  private async graphql<T>(
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://${this.config.shopifyStoreDomain}/admin/api/${this.config.shopifyApiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      throw new ShopifyEvidenceError("Unable to reach the Shopify Admin API.");
    }
    if (!response.ok) {
      throw new ShopifyEvidenceError(`Shopify returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length) {
      throw new ShopifyEvidenceError(
        payload.errors.map(({ message }) => message).join("; "),
      );
    }
    if (!payload.data) {
      throw new ShopifyEvidenceError("Shopify returned no GraphQL data.");
    }
    return payload.data;
  }
}

function isPaidOrder(order: ShopifyOrder): boolean {
  return (
    !order.test &&
    !order.cancelledAt &&
    Number(order.totalReceivedSet.shopMoney.amount) > 0 &&
    ["PAID", "PARTIALLY_REFUNDED"].includes(order.displayFinancialStatus ?? "")
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const QUERY = `
  query CreativeStudioEvidence($handle: String!, $ordersQuery: String!) {
    product: productByIdentifier(identifier: { handle: $handle }) {
      id title handle description productType tags status totalInventory onlineStoreUrl
      featuredImage { url altText width height }
      variants(first: 50) {
        nodes {
          title price compareAtPrice inventoryQuantity
          selectedOptions { name value }
        }
      }
    }
    orders(first: 100, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
      nodes {
        cancelledAt test displayFinancialStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalReceivedSet { shopMoney { amount currencyCode } }
        lineItems(first: 50) {
          nodes { currentQuantity product { handle } }
        }
      }
    }
  }
`;

interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

interface ShopifyOrder {
  cancelledAt: string | null;
  currentTotalPriceSet: { shopMoney: ShopifyMoney };
  displayFinancialStatus: string | null;
  lineItems: {
    nodes: Array<{ currentQuantity: number; product: { handle: string } | null }>;
  };
  test: boolean;
  totalReceivedSet: { shopMoney: ShopifyMoney };
}

interface ShopifyEvidenceData {
  orders: { nodes: ShopifyOrder[] };
  product: null | {
    description: string;
    featuredImage: null | {
      altText: string | null;
      height: number;
      url: string;
      width: number;
    };
    handle: string;
    id: string;
    onlineStoreUrl: string | null;
    productType: string;
    status: string;
    tags: string[];
    title: string;
    totalInventory: number;
    variants: {
      nodes: Array<{
        compareAtPrice: string | null;
        inventoryQuantity: number;
        price: string;
        selectedOptions: Array<{ name: string; value: string }>;
        title: string;
      }>;
    };
  };
}
