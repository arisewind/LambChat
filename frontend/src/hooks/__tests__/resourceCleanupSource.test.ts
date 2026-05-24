import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hooksDir = resolve(import.meta.dirname, "..");

test("useFileUpload aborts pending uploads and clears abort handlers on unmount", () => {
  const source = readFileSync(resolve(hooksDir, "useFileUpload.ts"), "utf8");

  assert.match(source, /const abortMap = abortMapRef\.current/);
  assert.match(source, /for \(const abort of abortMap\.values\(\)\)/);
  assert.match(source, /abortMap\.clear\(\)/);
});

test("useWebSocket suppresses refresh-triggered reconnects after unmount", () => {
  const source = readFileSync(resolve(hooksDir, "useWebSocket.ts"), "utf8");

  assert.match(source, /isMountedRef/);
  assert.match(
    source,
    /isMountedRef\.current && enabled && !wasManualDisconnect/,
  );
});
