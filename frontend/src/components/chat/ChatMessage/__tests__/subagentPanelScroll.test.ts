import assert from "node:assert/strict";
import test from "node:test";
import {
  isNearSubagentPanelBottom,
  startSubagentPanelScrollToBottom,
  shouldAutoScrollSubagentPanel,
} from "../subagentPanelScroll.ts";

test("detects whether the subagent panel is near the bottom", () => {
  assert.equal(
    isNearSubagentPanelBottom({
      scrollTop: 368,
      clientHeight: 100,
      scrollHeight: 500,
    }),
    true,
  );

  assert.equal(
    isNearSubagentPanelBottom({
      scrollTop: 300,
      clientHeight: 100,
      scrollHeight: 500,
    }),
    false,
  );
});

test("keeps subagent panel bottom-locked unless the user scrolled up", () => {
  const scroller = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 500,
  };

  assert.equal(
    shouldAutoScrollSubagentPanel({
      scroller,
      userScrolledUp: false,
    }),
    true,
  );

  assert.equal(
    shouldAutoScrollSubagentPanel({
      scroller,
      userScrolledUp: true,
    }),
    false,
  );
});

test("does not auto-scroll before the panel scroller mounts", () => {
  assert.equal(
    shouldAutoScrollSubagentPanel({
      scroller: null,
      userScrolledUp: false,
    }),
    false,
  );
});

test("keeps scrolling to the subagent panel bottom while content height is settling", async () => {
  const scroller = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 500,
  };

  const stop = startSubagentPanelScrollToBottom({
    scroller,
    intervalMs: 5,
    maxAttempts: 6,
  });

  assert.equal(scroller.scrollTop, 500);

  scroller.scrollHeight = 900;

  await new Promise((resolve) => setTimeout(resolve, 15));
  stop();

  assert.equal(scroller.scrollTop, 900);
});
