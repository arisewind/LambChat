import assert from "node:assert/strict";
import test from "node:test";

import { shouldInterceptFilePreviewLink } from "../revealPreviewLinks.ts";

test("intercepts relative file preview links", () => {
  assert.equal(
    shouldInterceptFilePreviewLink("/api/upload/file/report.pdf", {
      currentOrigin: "https://chat.example.com",
    }),
    true,
  );
});

test("intercepts same-origin absolute file preview links", () => {
  assert.equal(
    shouldInterceptFilePreviewLink(
      "https://chat.example.com/files/report.pdf",
      {
        currentOrigin: "https://chat.example.com",
      },
    ),
    true,
  );
});

test("does not intercept cross-origin absolute file preview links", () => {
  assert.equal(
    shouldInterceptFilePreviewLink("https://cdn.example.com/files/report.pdf", {
      currentOrigin: "https://chat.example.com",
    }),
    false,
  );
});
