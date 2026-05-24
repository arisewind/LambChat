import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../DocumentPreviewToolbar.tsx", import.meta.url),
  "utf8",
);

test("document preview toolbar compact mode observes the whole toolbar, not the action group", () => {
  const rootToolbar = source.match(
    /return \(\s*<div\s+ref=\{toolbarRef\}\s+className="(?<className>[^"]*border-b[^"]*)"/,
  );
  const actionGroup = source.match(
    /<div\s+ref=\{toolbarRef\}\s+className="(?<className>[^"]*relative z-10 shrink-0[^"]*)"/,
  );

  assert.ok(
    rootToolbar,
    "toolbarRef should be attached to the full toolbar container so compact mode uses available space",
  );
  assert.equal(
    actionGroup,
    null,
    "toolbarRef must not observe the action group because its width shrinks when labels are hidden",
  );
});
