import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbarSource = readFileSync(
  new URL("../DocumentPreviewToolbar.tsx", import.meta.url),
  "utf8",
);

test("document preview toolbar labeled icon buttons share text sizing", () => {
  assert.match(toolbarSource, /toolbarActionButtonClass/);
  assert.match(toolbarSource, /desktopToolbarActionButtonClass/);
  assert.match(toolbarSource, /text-xs sm:text-sm font-medium/);
});
