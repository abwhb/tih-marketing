const DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3";

export class DataForSeoApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataForSeoApiError";
  }
}

export interface KeywordIdea {
  competition?: number;
  competitionLevel?: string;
  cpc?: number;
  keyword: string;
  searchIntent?: string;
  searchVolume?: number;
}

export class DataForSeoClient {
  constructor(
    private readonly authorization: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async checkConnection(): Promise<{ authenticated: boolean }> {
    await this.request("/appendix/user_data", { method: "GET" });
    return { authenticated: true };
  }

  async keywordIdeas(
    keywords: string[],
    limit = 25,
  ): Promise<KeywordIdea[]> {
    if (keywords.length === 0 || keywords.length > 20) {
      throw new DataForSeoApiError("Provide between 1 and 20 seed keywords.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new DataForSeoApiError("Keyword idea limit must be between 1 and 100.");
    }

    const response = await this.request(
      "/dataforseo_labs/google/keyword_ideas/live",
      {
        method: "POST",
        body: JSON.stringify([
          {
            keywords,
            language_name: "English",
            location_name: "Australia",
            filters: [["keyword_info.search_volume", ">", 10]],
            limit,
          },
        ]),
      },
    );
    const payload = (await response.json()) as DataForSeoResponse;
    const task = payload.tasks?.[0];
    if (!task || task.status_code !== 20_000) {
      throw new DataForSeoApiError(
        `DataForSEO task failed: ${task?.status_message ?? "unknown response"}`,
      );
    }

    const items = task.result?.flatMap((result) => result.items ?? []) ?? [];
    return items
      .map((item): KeywordIdea | null => {
        if (!item.keyword) return null;
        const keywordInfo = item.keyword_info;
        const searchIntent = item.search_intent_info?.main_intent;
        return {
          keyword: item.keyword,
          ...(typeof keywordInfo?.search_volume === "number"
            ? { searchVolume: keywordInfo.search_volume }
            : {}),
          ...(typeof keywordInfo?.cpc === "number" ? { cpc: keywordInfo.cpc } : {}),
          ...(typeof keywordInfo?.competition === "number"
            ? { competition: keywordInfo.competition }
            : {}),
          ...(keywordInfo?.competition_level
            ? { competitionLevel: keywordInfo.competition_level }
            : {}),
          ...(searchIntent ? { searchIntent } : {}),
        };
      })
      .filter((item): item is KeywordIdea => item !== null);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${DATAFORSEO_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new DataForSeoApiError("Unable to reach DataForSEO.");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new DataForSeoApiError("DataForSEO rejected the configured credential.");
      }
      throw new DataForSeoApiError(`DataForSEO returned HTTP ${response.status}.`);
    }
    return response;
  }
}

interface DataForSeoResponse {
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        keyword?: string;
        keyword_info?: {
          competition?: number;
          competition_level?: string;
          cpc?: number;
          search_volume?: number;
        };
        search_intent_info?: { main_intent?: string };
      }>;
    }>;
    status_code?: number;
    status_message?: string;
  }>;
}
