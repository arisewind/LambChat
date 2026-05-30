import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoalForMessage,
  getVisibleActiveGoalForMessages,
  shouldShowGoalDetailsForMessage,
} from "../goalVisibility.ts";
import type { Message } from "../../../types";
import type { ActiveGoalSpec } from "../../../hooks/useAgent/types";

const goal: ActiveGoalSpec = {
  objective: "ship it",
  started_at: "2026-05-30T08:00:00.000Z",
  runId: "run-goal",
};

function message(overrides: Partial<Message>): Message {
  return {
    id: "message",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-05-30T08:01:00.000Z"),
    ...overrides,
  };
}

test("hides the active goal when the current conversation has no messages", () => {
  assert.equal(getVisibleActiveGoalForMessages(goal, []), null);
});

test("keeps the active goal visible when a current message belongs to its run", () => {
  assert.equal(
    getVisibleActiveGoalForMessages(goal, [
      message({ id: "user", role: "user", runId: "run-goal" }),
    ]),
    goal,
  );
});

test("hides the active goal when the latest message belongs to another run", () => {
  assert.equal(
    getVisibleActiveGoalForMessages(goal, [
      message({ id: "goal-message", runId: "run-goal" }),
      message({ id: "ordinary", runId: "run-other" }),
    ]),
    null,
  );
});

test("resolves the historical goal for a message by run id", () => {
  assert.equal(
    getGoalForMessage(
      {
        "run-goal": goal,
      },
      message({ id: "goal-message", runId: "run-goal" }),
    ),
    goal,
  );
});

test("does not show goal details on messages from a different run", () => {
  assert.equal(
    shouldShowGoalDetailsForMessage(
      goal,
      message({ id: "ordinary", runId: "run-other" }),
    ),
    false,
  );
});

test("shows goal details on messages from the goal run", () => {
  assert.equal(
    shouldShowGoalDetailsForMessage(
      goal,
      message({ id: "goal-message", runId: "run-goal" }),
    ),
    true,
  );
});
