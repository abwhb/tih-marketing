#!/usr/bin/env node

import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AuditLog } from "./audit-log.ts";
import { loadRuntimeConfig } from "./config.ts";
import { ShopifyAdminClient } from "./shopify-client.ts";
import { FileTokenStore } from "./token-store.ts";
import { registerShopifyTools } from "./tools/register-tools.ts";

const config = loadRuntimeConfig();
const tokenStore = new FileTokenStore(config.tokenStorePath);
const client = new ShopifyAdminClient(config, tokenStore);
const auditLog = new AuditLog(join(dirname(config.tokenStorePath), "audit.jsonl"));

const server = new McpServer({
  name: "tih-shopify-mcp-server",
  version: "0.1.0",
});

registerShopifyTools(server, { auditLog, client, config });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("TIH Shopify MCP server connected over stdio.");
