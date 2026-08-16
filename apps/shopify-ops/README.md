# TIH Shopify Ops

Shopify Admin API gateway and MCP server for The Inspire Home. A stable Vercel callback completes Partner-app OAuth, stores the offline token encrypted in Upstash Redis, and lets the local MCP process synchronise it through an authenticated HTTPS endpoint.

## Components

- Next.js/Vercel OAuth routes with state-cookie, timestamp, shop-domain, and Shopify HMAC validation.
- AES-256-GCM encryption before the session reaches Redis.
- Authenticated token synchronisation into local `.data/shopify-session.json` with `0600` permissions.
- GraphQL Admin API client pinned through `SHOPIFY_API_VERSION`.
- Stdio MCP server with product/order tools plus arbitrary GraphQL access.
- Mutation confirmation and value-free audit logging.

## Install and verify

```sh
cd apps/shopify-ops
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Configuration is read locally from the ignored repository-root `.env`. Vercel production secrets are managed through project environment variables.

## Deploy and connect

The production project is `tih-shopify-ops`. It requires an Upstash Redis integration and these production variables:

```text
SHOPIFY_STORE_DOMAIN
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_API_VERSION
SHOPIFY_APP_URL
SHOPIFY_MCP_SYNC_SECRET
SHOPIFY_SESSION_ENCRYPTION_KEY
KV_REST_API_URL
KV_REST_API_TOKEN
```

Deploy from this directory with `vercel --prod`. In the Shopify Dev Dashboard app version, set the allowed redirect URL to:

```text
https://tih-shopify-ops.vercel.app/auth/callback
```

Release the version, then open `https://tih-shopify-ops.vercel.app/auth` and approve access. Afterwards, synchronise the encrypted remote session locally:

```sh
pnpm sync-token
```

## Run the MCP server

```sh
pnpm start:mcp
```

Tools: `shopify_connection_status`, `shopify_search_products`, `shopify_list_orders`, `shopify_graphql_query`, and `shopify_graphql_mutation`.

The mutation tool requires the exact confirmation `CONFIRM_SHOPIFY_MUTATION`. Shopify's granted scopes remain the capability boundary.

## Security

Never commit `.env`, `.env.local`, `.data/`, OAuth tokens, or Redis credentials. The browser never receives the Shopify access token. Rotate the client secret, sync secret, and session encryption key after suspected disclosure; then complete OAuth again.
