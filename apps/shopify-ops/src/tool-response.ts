import { CHARACTER_LIMIT } from "./constants.ts";

export type ResponseFormat = "json" | "markdown";

export interface ToolSuccess {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
}

export interface ToolFailure {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

export function toolSuccess(
  value: Record<string, unknown>,
  markdown?: string,
  responseFormat: ResponseFormat = "json",
): ToolSuccess {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.length > CHARACTER_LIMIT) {
    const truncated = {
      truncated: true,
      characterCount: serialized.length,
      preview: serialized.slice(0, CHARACTER_LIMIT - 500),
      message: "Response truncated. Use a smaller limit, a cursor, or a narrower query.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(truncated, null, 2) }],
      structuredContent: truncated,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: responseFormat === "markdown" && markdown ? markdown : serialized,
      },
    ],
    structuredContent: value,
  };
}

export function toolFailure(error: unknown): ToolFailure {
  const message =
    error instanceof Error ? error.message : "An unexpected operation error occurred.";
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
