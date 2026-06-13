import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const agentPanelSource = readFileSync(
  join(import.meta.dirname, "../AgentPanel/AgentConfigPanel.tsx"),
  "utf8",
);

const modelPanelSource = readFileSync(
  join(import.meta.dirname, "../ModelPanel/ModelPanel.tsx"),
  "utf8",
);

const agentSectionSource = readFileSync(
  join(import.meta.dirname, "../AgentModelPanel/AgentSection.tsx"),
  "utf8",
);

const modelSectionSource = readFileSync(
  join(import.meta.dirname, "../AgentModelPanel/ModelSection.tsx"),
  "utf8",
);

test("agent and model configuration pages use matching skeleton screens", () => {
  assert.match(agentPanelSource, /import \{ AgentPanelSkeleton \}/);
  assert.match(modelPanelSource, /import \{ ModelPanelSkeleton \}/);
  assert.match(agentPanelSource, /return <AgentPanelSkeleton \/>/);
  assert.match(modelPanelSource, /return <ModelPanelSkeleton \/>/);
});

test("agent and model configuration errors share one callout component", () => {
  for (const source of [
    agentPanelSource,
    modelPanelSource,
    agentSectionSource,
    modelSectionSource,
  ]) {
    assert.match(source, /ConfigPanelErrorCallout/);
  }
});
