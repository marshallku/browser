import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../utils/csv.js";

test("parseCsv should parse quoted delimiters and escaped quotes", () => {
  const rows = parseCsv(
    'name,password,note\nmarshall,"pw,123","said ""hello"""',
    ","
  );

  assert.deepEqual(rows, [
    ["name", "password", "note"],
    ["marshall", "pw,123", 'said "hello"'],
  ]);
});

test("parseCsv should skip blank rows", () => {
  const rows = parseCsv("name,value\n\nalpha,beta\n", ",");

  assert.deepEqual(rows, [
    ["name", "value"],
    ["alpha", "beta"],
  ]);
});
