import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const usagePanelSource = readFileSync(
  join(import.meta.dirname, "../UsagePanel.tsx"),
  "utf8",
);

const usageTableSource = readFileSync(
  join(import.meta.dirname, "../UsagePanel/UsageLogsTable.tsx"),
  "utf8",
);

const insightSource = readFileSync(
  join(import.meta.dirname, "../UsagePanel/InsightStrip.tsx"),
  "utf8",
);

const trendSource = readFileSync(
  join(import.meta.dirname, "../UsagePanel/MiniTrend.tsx"),
  "utf8",
);

test("usage admin and read views present different dashboard context", () => {
  assert.match(usagePanelSource, /const dashboardTitle = isAdmin/);
  assert.match(usagePanelSource, /usage\.dashboard\.titleAdmin/);
  assert.match(usagePanelSource, /usage\.dashboard\.titleUser/);
  assert.match(
    usagePanelSource,
    /isAdmin && \(\s*<RankingList[\s\S]*?usage\.ranking\.userAdmin/,
  );
  assert.match(
    usagePanelSource,
    /isAdmin && dashboard && dashboard\.triggers\.length > 0/,
  );
});

test("usage table keeps admin-only user column and aligned numeric columns", () => {
  assert.match(usageTableSource, /gridTemplateColumns: desktopGridTemplate/);
  assert.match(usageTableSource, /desktopGridTemplate = isAdmin/);
  assert.match(usageTableSource, /min-w-\[1080px\]/);
  assert.match(usageTableSource, /minmax\(8\.5rem,1fr\)/);
  assert.match(usageTableSource, /usage\.roleOrTeam/);
  assert.match(usageTableSource, /personaOrTeam/);
  assert.match(usageTableSource, /usage\.cache/);
  assert.match(usageTableSource, /usage\.cacheRead/);
  assert.match(usageTableSource, /text-right/);
  assert.match(usageTableSource, /fmt\(log\.cache_read_tokens\)/);
  assert.doesNotMatch(usageTableSource, /opacity-15/);
  assert.doesNotMatch(usageTableSource, /<table/);
  assert.doesNotMatch(
    usageTableSource,
    /grid-cols-3 gap-1\.5 rounded-lg bg-\[var\(--usage-inset-bg\)\]/,
  );
});

test("usage visual accents use theme colors instead of hard-coded chart palette", () => {
  assert.doesNotMatch(insightSource, /border-l-(blue|violet|cyan|rose)-500/);
  assert.doesNotMatch(
    insightSource,
    /border-l-\[3px\]|border-l-\[var\(--theme-primary\)\]/,
  );
  assert.doesNotMatch(trendSource, /#3b82f6|#06b6d4|bg-blue-500/);
  assert.match(trendSource, /var\(--theme-primary\)/);
  assert.match(trendSource, /var\(--usage-chart-secondary\)/);
});
