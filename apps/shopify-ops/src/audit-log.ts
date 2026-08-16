import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { getOperationName } from "./graphql-document.ts";

export interface MutationAuditEntry {
  document: string;
  outcome: "error" | "success";
  shopDomain: string;
  variables: Record<string, unknown>;
}

export class AuditLog {
  constructor(private readonly path: string) {}

  async record(entry: MutationAuditEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const record = {
      timestamp: new Date().toISOString(),
      shopDomain: entry.shopDomain,
      operationName: getOperationName(entry.document),
      documentSha256: createHash("sha256")
        .update(entry.document)
        .digest("hex"),
      variableKeys: Object.keys(entry.variables).sort(),
      outcome: entry.outcome,
    };
    await appendFile(this.path, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(this.path, 0o600);
  }
}
