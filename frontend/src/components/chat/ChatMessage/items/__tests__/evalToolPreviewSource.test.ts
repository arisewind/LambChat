import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

test("eval tool has a dedicated item with code preview", () => {
  const source = readSource("../EvalItem.tsx");

  expect(source).toMatch(/function isEvalToolName/);
  expect(source).toMatch(/function getEvalCodePreview/);
  expect(source).toMatch(/function getEvalPillSummary/);
  expect(source).toMatch(/Code2 size=\{12\}/);
  // 基础标签（含 pillSummary）经流式标签 hook 进入 pill
  expect(source).toMatch(
    /useToolStreamingLabel\(\s*pillSummary \? `\$\{evalLabel\} \$\{pillSummary\}` : evalLabel,/,
  );
  expect(source).toMatch(/formatLabel=\{false\}/);
  expect(source).toMatch(/chat\.message\.codePreview/);
});

test("generic tool calls include an argument summary in the pill label", () => {
  const source = readSource("../../ToolCallItem.tsx");

  expect(source).toMatch(/function buildToolPillSummary/);
  expect(source).toMatch(
    /const pillSummary = buildToolPillSummary\(displayArgs\);/,
  );
  // 基础标签（含 pillSummary）经流式标签 hook 进入 pill
  expect(source).toMatch(
    /useToolStreamingLabel\(\s*pillSummary \? `\$\{toolName\} \$\{pillSummary\}` : toolName,/,
  );
  expect(source).toMatch(/formatLabel=\{false\}/);
});

test("eval code preview uses theme-aware surfaces", () => {
  const source = readSource("../EvalItem.tsx");

  expect(source).toMatch(/eval-code-preview/);
  expect(source).not.toMatch(/bg-stone-950|text-stone-100/);
});

test("message part renderer routes eval tools to the dedicated item for all agents", () => {
  const source = readSource("../../MessagePartRenderer.tsx");

  expect(source).toMatch(/part\.name\s*===\s*"eval"/);
  expect(source).toMatch(/<EvalItem/);
  expect(source).toMatch(/<ToolCallItem/);
});

test("eval item renders the parsed wire result instead of raw tags", () => {
  const source = readSource("../EvalItem.tsx");

  expect(source).toMatch(/parseEvalWireResult/);
  expect(source).toMatch(/EvalResultContent/);
  expect(source).toMatch(/consoleOutput/);
  expect(source).not.toMatch(/<ToolResultContent/);
});

test("eval result values render in the standard mono block without oversized display", () => {
  const source = readSource("../EvalItem.tsx");

  expect(source).not.toMatch(/text-24/);
  expect(source).not.toMatch(/isProminentEvalValue/);
  expect(source).toMatch(/evalCodePreviewClassName/);
});
