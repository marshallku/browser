import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

export interface SecretRecord {
  id: string;
  label?: string;
  createdAt: number;
}

export interface SecretStore {
  put(value: string, label?: string): Promise<SecretRecord>;
  get(id: string): Promise<string>;
  delete(id: string): Promise<void>;
}

interface StoredSecret extends SecretRecord {
  iv: string;
  authTag: string;
  ciphertext: string;
}

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class InMemorySecretStore implements SecretStore {
  private readonly key = randomBytes(KEY_BYTES);
  private readonly records = new Map<string, StoredSecret>();

  async put(value: string, label?: string): Promise<SecretRecord> {
    const id = randomUUID();
    const createdAt = Date.now();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const record: StoredSecret = {
      id,
      label,
      createdAt,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    this.records.set(id, record);
    return { id, label, createdAt };
  }

  async get(id: string): Promise<string> {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Secret not found: ${id}`);
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(record.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

const defaultStore = new InMemorySecretStore();

export function getSecretStore(): SecretStore {
  return defaultStore;
}

export function redact(value: string, keepLast = 0): string {
  if (!value) {
    return "";
  }
  if (keepLast <= 0 || value.length <= keepLast) {
    return "*".repeat(Math.max(8, value.length));
  }
  const visible = value.slice(-keepLast);
  return `${"*".repeat(Math.max(8, value.length - keepLast))}${visible}`;
}
