import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ActiveGoalBar } from "../ActiveGoalBar.tsx";

test("renders final goal runtime from lifecycle timestamps", () => {
  const html = renderToStaticMarkup(
    <ActiveGoalBar
      goal={{
        objective: "finish docs",
        started_at: "2026-05-30T08:00:00.000Z",
        ended_at: "2026-05-30T08:02:03.000Z",
      }}
      durationLabel="运行"
    />,
  );

  assert.match(html, /finish docs/);
  assert.match(html, /运行 02:03/);
});

test("embedded mode omits standalone border/background", () => {
  const html = renderToStaticMarkup(
    <ActiveGoalBar
      goal={{
        objective: "embedded goal",
        started_at: "2026-05-30T08:00:00.000Z",
        ended_at: "2026-05-30T08:01:00.000Z",
      }}
      durationLabel="运行"
      embedded
    />,
  );

  // Embedded should NOT have the standalone emerald border/bg classes
  assert.ok(!html.includes("border-emerald"), "should not have emerald border");
  assert.ok(!html.includes("bg-emerald"), "should not have emerald background");
  // Should still show the objective
  assert.match(html, /embedded goal/);
});

test("returns null when goal is null", () => {
  const html = renderToStaticMarkup(<ActiveGoalBar goal={null} />);
  assert.equal(html, "");
});
