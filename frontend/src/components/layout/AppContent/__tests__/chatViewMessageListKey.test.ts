import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const chatViewSource = readFileSync(
  resolve(
    process.cwd(),
    "src",
    "components",
    "layout",
    "AppContent",
    "ChatView.tsx",
  ),
  "utf8",
);

test("drives the Virtuoso session key through state so session switches remount the message list", () => {
  assert.match(chatViewSource, /setMessageListSessionKey/);
  assert.match(chatViewSource, /key=\{messageListSessionKey\}/);
  assert.doesNotMatch(
    chatViewSource,
    /key=\{messageListSessionKeyRef\.current\}/,
  );
});

test("does not reuse the Virtuoso remount key as a bottom-lock token", () => {
  assert.doesNotMatch(
    chatViewSource,
    /useMessageScroll\([\s\S]*isLoadingHistory,\s*messageListSessionKey,\s*\)/,
  );
  assert.match(
    chatViewSource,
    /useMessageScroll\([\s\S]*isLoadingHistory,\s*null,\s*\)/,
  );
});

test("anchors floating scroll buttons to the chat input", () => {
  assert.match(
    chatViewSource,
    /const FLOATING_SCROLL_BUTTON_OFFSET_CLASS = "bottom-full mb-3";/,
  );
  assert.equal(
    chatViewSource.match(/\$\{FLOATING_SCROLL_BUTTON_OFFSET_CLASS\}/g)?.length,
    2,
  );
  assert.match(
    chatViewSource,
    /\{messages\.length > 0 && \(\s*<div className="relative">[\s\S]*<ChatInput\s+[\s\S]*\{\.\.\.chatInputProps\}[\s\S]*<\/div>\s*\)\}/,
  );
  assert.doesNotMatch(chatViewSource, /bottom-\d+/);
});
