import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultGoalRubric,
  buildGoalFromPrompt,
  planGoalSubmission,
  parseFrontendGoalCommand,
} from "../goalCommands.ts";

test("parses frontend inline goal command as run prompt and goal", () => {
  const command = parseFrontendGoalCommand("/goal finish docs");

  assert.deepEqual(command, {
    action: "run",
    prompt: "finish docs",
    goal: {
      objective: "finish docs",
      rubric: buildDefaultGoalRubric("finish docs"),
      max_iterations: 3,
    },
  });
});

test("parses frontend inline goal command with explicit rubric", () => {
  const command = parseFrontendGoalCommand(
    "/goal finish docs\n---\n- docs updated\n- tests pass",
  );

  assert.deepEqual(command, {
    action: "run",
    prompt: "finish docs",
    goal: {
      objective: "finish docs",
      rubric: "- docs updated\n- tests pass",
      max_iterations: 3,
    },
  });
});

test("parses frontend goal clear command", () => {
  assert.deepEqual(parseFrontendGoalCommand("/goal clear"), {
    action: "clear",
  });
});

test("treats bare goal command as invalid", () => {
  assert.deepEqual(parseFrontendGoalCommand("/goal"), {
    action: "invalid",
  });
});

test("ignores normal messages", () => {
  assert.equal(parseFrontendGoalCommand("please continue"), null);
});

test("builds a goal from a normal prompt for goal mode", () => {
  assert.deepEqual(buildGoalFromPrompt("please continue"), {
    objective: "please continue",
    rubric: buildDefaultGoalRubric("please continue"),
    max_iterations: 3,
  });
});

test("plans inline goal command as one run-scoped send with stripped prompt and goal", () => {
  const plan = planGoalSubmission("/goal finish docs", false);

  assert.deepEqual(plan, {
    content: "finish docs",
    goal: {
      objective: "finish docs",
      rubric: buildDefaultGoalRubric("finish docs"),
      max_iterations: 3,
    },
    nextGoalModeEnabled: false,
    nextActiveGoal: {
      objective: "finish docs",
      rubric: buildDefaultGoalRubric("finish docs"),
      max_iterations: 3,
    },
    handledWithoutSend: false,
  });
});

test("plans normal messages in goal mode as prompt and run goal", () => {
  const plan = planGoalSubmission("continue implementation", true);

  assert.deepEqual(plan, {
    content: "continue implementation",
    goal: {
      objective: "continue implementation",
      rubric: buildDefaultGoalRubric("continue implementation"),
      max_iterations: 3,
    },
    nextGoalModeEnabled: true,
    nextActiveGoal: {
      objective: "continue implementation",
      rubric: buildDefaultGoalRubric("continue implementation"),
      max_iterations: 3,
    },
    handledWithoutSend: false,
  });
});

test("plans goal clear as local-only frontend cleanup", () => {
  const plan = planGoalSubmission("/goal clear", true);

  assert.deepEqual(plan, {
    content: "/goal clear",
    goal: null,
    nextGoalModeEnabled: false,
    nextActiveGoal: null,
    handledWithoutSend: true,
  });
});

test("plans bare goal command as invalid local-only action", () => {
  const plan = planGoalSubmission("/goal", false);

  assert.deepEqual(plan, {
    content: "/goal",
    goal: null,
    nextGoalModeEnabled: false,
    nextActiveGoal: null,
    handledWithoutSend: true,
    errorKey: "chat.goal.required",
  });
});
