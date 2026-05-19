import test from "node:test";
import assert from "node:assert/strict";

import { resolveSkillListParams } from "../useSkills.ts";

test("resolveSkillListParams requests the selector-sized list by default", () => {
  assert.deepEqual(resolveSkillListParams(undefined, undefined), {
    limit: 1000,
  });
});

test("resolveSkillListParams gives explicit fetch params priority", () => {
  assert.deepEqual(
    resolveSkillListParams({ skip: 20, limit: 20 }, { limit: 1000 }),
    { skip: 20, limit: 20 },
  );
});
