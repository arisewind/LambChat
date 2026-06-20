import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const skillsListSource = readFileSync(
  join(import.meta.dirname, "../SkillsPanel/SkillsList.tsx"),
  "utf8",
);

const memoryPanelSource = readFileSync(
  join(import.meta.dirname, "../MemoryPanel/index.tsx"),
  "utf8",
);

const skeletonIndexSource = readFileSync(
  join(import.meta.dirname, "../../skeletons/index.ts"),
  "utf8",
);

test("embedded skills list loading uses an embedded skeleton", () => {
  assert.match(skillsListSource, /SkillsListSkeleton/);
  assert.match(
    skillsListSource,
    /return embedded \? <SkillsListSkeleton \/> : <SkillsPanelSkeleton \/>/,
  );
});

test("memory panel initial loading uses a panel-specific skeleton", () => {
  assert.match(memoryPanelSource, /import \{ MemoryPanelSkeleton \}/);
  assert.match(memoryPanelSource, /<MemoryPanelSkeleton \/>/);
  assert.doesNotMatch(memoryPanelSource, /<PanelLoadingState \/>/);
  assert.match(skeletonIndexSource, /MemoryPanelSkeleton/);
});
