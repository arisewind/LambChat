import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("approval panel renders radio and multi-select fields as explicit choice controls", () => {
  const source = readSource("../ApprovalPanel.tsx");

  assert.match(source, /case "radio":/);
  assert.match(source, /approval-choice-list/);
  assert.match(source, /approval-choice-option--selected/);
  assert.match(source, /CircleDot/);
  assert.match(source, /SquareCheck/);
});

test("ask human history snapshot mirrors choice controls", () => {
  const source = readSource("../../chat/ChatMessage/items/AskHumanItem.tsx");

  assert.match(source, /field\.type === "radio"/);
  assert.match(source, /approval-choice-option--readonly/);
  assert.match(source, /approval-choice-option--selected/);
});
