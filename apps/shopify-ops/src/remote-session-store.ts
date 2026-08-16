import { Redis } from "@upstash/redis";

import { REMOTE_SESSION_KEY } from "./constants.ts";
import {
  decryptStoredSession,
  encryptStoredSession,
} from "./session-crypto.ts";
import type { StoredSession } from "./token-store.ts";

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
}

export interface RedisCredentials {
  token: string;
  url: string;
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly encryptionKey: string,
    private readonly redis: Redis = new Redis(resolveRedisCredentials()),
  ) {}

  async load(): Promise<StoredSession | null> {
    const encrypted = await this.redis.get<string>(REMOTE_SESSION_KEY);
    if (encrypted === null) {
      return null;
    }
    if (typeof encrypted !== "string") {
      throw new Error("The remote Shopify session has an invalid format.");
    }
    return decryptStoredSession(encrypted, this.encryptionKey);
  }

  async save(session: StoredSession): Promise<void> {
    await this.redis.set(
      REMOTE_SESSION_KEY,
      encryptStoredSession(session, this.encryptionKey),
    );
  }
}

export function resolveRedisCredentials(
  env: NodeJS.ProcessEnv = process.env,
): RedisCredentials {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Redis credentials are unavailable. Connect the Vercel Upstash integration.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("The configured Redis REST URL is invalid.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("The configured Redis REST URL must use HTTPS.");
  }

  return { token, url: parsedUrl.toString() };
}
