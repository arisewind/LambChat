import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseCss = readFileSync(
  new URL("../../../../styles/base.css", import.meta.url),
  "utf8",
);

test("sidebar icon labels share one nav text style", () => {
  const navButtonRule = baseCss.match(/\.sidebar-nav-btn\s*\{[\s\S]*?\}/)?.[0];

  assert.ok(navButtonRule, "sidebar-nav-btn rule should exist");
  assert.match(navButtonRule, /font-size:\s*0\.875rem;/);
  assert.match(navButtonRule, /line-height:\s*1\.25rem;/);
  assert.match(navButtonRule, /font-weight:\s*500;/);
});
