import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

test("memory recall query summary does not render a floating copy button", () => {
  const source = readSource("../MemoryRecallItem.tsx");
  const querySummaryStart = source.indexOf("{/* Query summary header */}");
  const memoryCardsStart = source.indexOf("{/* Memory cards */}");

  assert.notEqual(querySummaryStart, -1);
  assert.notEqual(memoryCardsStart, -1);
  assert.ok(memoryCardsStart > querySummaryStart);

  const querySummarySource = source.slice(querySummaryStart, memoryCardsStart);

  assert.doesNotMatch(querySummarySource, /<ToolHoverCopyButton\b/);
});
