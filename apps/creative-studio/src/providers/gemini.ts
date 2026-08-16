const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiApiError";
  }
}

export interface GeminiClientOptions {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  imageModel: string;
  textModel: string;
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

export interface ReferenceImage {
  data: Buffer;
  mimeType: string;
}

export class GeminiClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: GeminiClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async checkConnection(): Promise<{
    imageModelAvailable: boolean;
    modelCount: number;
    textModelAvailable: boolean;
  }> {
    const response = await this.request("/models", { method: "GET" });
    const payload = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const names = new Set(
      (payload.models ?? [])
        .map(({ name }) => name?.replace(/^models\//, ""))
        .filter((name): name is string => Boolean(name)),
    );
    return {
      imageModelAvailable: names.has(this.options.imageModel),
      modelCount: names.size,
      textModelAvailable: names.has(this.options.textModel),
    };
  }

  async generateJson<T>(
    prompt: string,
    responseSchema: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.request(
      `/models/${encodeURIComponent(this.options.textModel)}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.7,
          },
        }),
      },
    );
    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = extractText(payload);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GeminiApiError("Gemini returned invalid structured JSON.");
    }
  }

  async generateImage(
    prompt: string,
    referenceImages: ReferenceImage[] = [],
  ): Promise<GeneratedImage> {
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    for (const image of referenceImages) {
      parts.push({
        inlineData: {
          data: image.data.toString("base64"),
          mimeType: image.mimeType,
        },
      });
    }

    const response = await this.request(
      `/models/${encodeURIComponent(this.options.imageModel)}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );
    const payload = (await response.json()) as GeminiGenerateContentResponse;
    for (const candidate of payload.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType) {
          return {
            data: Buffer.from(part.inlineData.data, "base64"),
            mimeType: part.inlineData.mimeType,
          };
        }
      }
    }
    throw new GeminiApiError("Gemini returned no generated image.");
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${GEMINI_BASE_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.options.apiKey,
          ...init.headers,
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new GeminiApiError("Unable to reach the Gemini API.");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new GeminiApiError("Gemini rejected the configured API key.");
      }
      if (response.status === 429) {
        throw new GeminiApiError("Gemini rate limit or quota reached.");
      }
      throw new GeminiApiError(`Gemini returned HTTP ${response.status}.`);
    }
    return response;
  }
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
    };
  }>;
}

export function extractText(payload: GeminiGenerateContentResponse): string {
  const text = (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiApiError("Gemini returned no text response.");
  }
  return text;
}
