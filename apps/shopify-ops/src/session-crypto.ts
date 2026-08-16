import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { StoredSessionSchema, type StoredSession } from "./token-store.ts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class SessionCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCryptoError";
  }
}

export function encryptStoredSession(
  session: StoredSession,
  encodedKey: string,
): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(StoredSessionSchema.parse(session)));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptStoredSession(
  payload: string,
  encodedKey: string,
): StoredSession {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      payload.split(".");
    if (
      version !== "v1" ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra
    ) {
      throw new SessionCryptoError("The encrypted Shopify session is invalid.");
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      decodeKey(encodedKey),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return StoredSessionSchema.parse(JSON.parse(plaintext) as unknown);
  } catch (error) {
    if (error instanceof SessionCryptoError) {
      throw error;
    }
    throw new SessionCryptoError("Unable to decrypt the Shopify session.");
  }
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new SessionCryptoError(
      "SHOPIFY_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}
