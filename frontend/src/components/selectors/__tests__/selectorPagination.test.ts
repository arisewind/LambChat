import test from "node:test";
import assert from "node:assert/strict";

import { createPagedGroups } from "../selectorPagination.ts";

test("createPagedGroups paginates after applying stable grouped order", () => {
  const result = createPagedGroups(
    [
      { name: "zeta", category: "mcp" },
      { name: "bravo", category: "builtin" },
      { name: "alpha", category: "mcp" },
    ],
    {
      page: 1,
      pageSize: 2,
      getGroupKey: (item) => item.category,
      sortItems: (a, b) => a.name.localeCompare(b.name),
    },
  );

  assert.deepEqual(Object.keys(result.fullGroups), ["mcp", "builtin"]);
  assert.deepEqual(
    Object.values(result.pagedGroups)
      .flat()
      .map((item) => item.name),
    ["alpha", "zeta"],
  );
  assert.equal(result.totalPages, 2);
});
