import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

export const StoredSessionSchema = z.object({
  accessToken: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  refreshToken: z.string().min(1).optional(),
  refreshTokenExpiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()),
  shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
});

export type StoredSession = z.infer<typeof StoredSessionSchema>;

export class TokenStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenStoreError";
  }
}

export class FileTokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<StoredSession | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = StoredSessionSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        throw new TokenStoreError(
          "The stored Shopify session is invalid. Complete OAuth again.",
        );
      }
      return parsed.data;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      if (error instanceof TokenStoreError) {
        throw error;
      }
      throw new TokenStoreError("Unable to read the local Shopify session.");
    }
  }

  async save(session: StoredSession): Promise<void> {
    const validated = StoredSessionSchema.parse(session);
    const directory = dirname(this.path);
    const temporaryPath = join(
      directory,
      `.${basename(this.path)}.${process.pid}.tmp`,
    );

    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
    await chmod(this.path, 0o600);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
