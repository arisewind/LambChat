import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAT_INPUT_SLASH_COMMANDS,
  applySlashCommandSelection,
  getMatchingSlashCommands,
  getSlashCommandQuery,
} from "../chatInputSlashCommands.ts";

test("finds the goal command while typing a slash command prefix", () => {
  assert.equal(getSlashCommandQuery("/go", 3), "go");
  assert.deepEqual(getMatchingSlashCommands("/go", 3), [
    CHAT_INPUT_SLASH_COMMANDS[0],
  ]);
});

test("does not show slash commands after text content has started", () => {
  assert.equal(getSlashCommandQuery("please /go", 10), null);
  assert.deepEqual(getMatchingSlashCommands("/goal write docs", 16), []);
});

test("selecting goal command inserts a trailing space for direct goal text", () => {
  assert.deepEqual(
    applySlashCommandSelection("/go", 3, CHAT_INPUT_SLASH_COMMANDS[0]),
    {
      input: "/goal ",
      cursorPosition: 6,
    },
  );
});
