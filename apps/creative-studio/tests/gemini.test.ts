import assert from "node:assert/strict";
import { test } from "node:test";

import { extractText, GeminiApiError } from "../src/providers/gemini.ts";

test("extracts text from Gemini candidate parts", () => {
  assert.equal(
    extractText({
      candidates: [{ content: { parts: [{ text: "{\"status\":" }, { text: "\"ok\"}" }] } }],
    }),
    '{"status":"ok"}',
  );
});

test("rejects an empty Gemini response", () => {
  assert.throws(() => extractText({ candidates: [] }), GeminiApiError);
});
