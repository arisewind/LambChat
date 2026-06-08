import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../SubagentBlocks.tsx", import.meta.url),
  "utf8",
);

test("subagent complete and cancelled chrome matches todo block border treatment", () => {
  assert.match(source, /ring-stone-200 dark:ring-stone-700\/80/);
  assert.match(source, /bg-stone-50\/80 dark:bg-stone-800\/40/);
  assert.doesNotMatch(source, /border-theme-border\/60/);
});
