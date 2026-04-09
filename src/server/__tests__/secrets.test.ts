import test from "node:test";
import assert from "node:assert/strict";
import { InMemorySecretStore, redact } from "../secrets.js";

test("InMemorySecretStore should round-trip and delete secrets", async () => {
  const store = new InMemorySecretStore();
  const record = await store.put("pw-12345", "login");

  assert.equal(await store.get(record.id), "pw-12345");

  await store.delete(record.id);

  await assert.rejects(() => store.get(record.id), /Secret not found/);
});

test("redact should preserve only the configured suffix", () => {
  assert.equal(redact("pw-12345", 2), "********45");
  assert.equal(redact("abcd", 0), "********");
});
