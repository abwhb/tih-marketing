import {
  loadVercelOAuthConfig,
  type VercelOAuthConfig,
} from "./config.ts";
import { RedisSessionStore } from "./remote-session-store.ts";

export interface VercelDependencies {
  config: VercelOAuthConfig;
  sessionStore: RedisSessionStore;
}

export function loadVercelDependencies(): VercelDependencies {
  const config = loadVercelOAuthConfig();
  return {
    config,
    sessionStore: new RedisSessionStore(config.sessionEncryptionKey),
  };
}
