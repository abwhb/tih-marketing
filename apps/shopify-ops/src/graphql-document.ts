export type GraphQLOperationKind = "query" | "mutation";

export function getOperationKind(document: string): GraphQLOperationKind | null {
  const normalized = document
    .replace(/^\uFEFF/, "")
    .replace(/#[^\n\r]*/g, "")
    .trimStart();

  if (normalized.startsWith("{")) {
    return "query";
  }
  if (/^query(?:\s|\(|\{)/i.test(normalized)) {
    return "query";
  }
  if (/^mutation(?:\s|\(|\{)/i.test(normalized)) {
    return "mutation";
  }
  return null;
}

export function getOperationName(document: string): string | null {
  const match = document
    .replace(/#[^\n\r]*/g, "")
    .match(/^\s*(?:query|mutation)\s+([_A-Za-z][_0-9A-Za-z]*)/i);
  return match?.[1] ?? null;
}
