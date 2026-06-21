import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { TaskToastMarkdown } from "../TaskToastMarkdown.tsx";

test("renders inline markdown in task toast bodies", () => {
  const html = renderToStaticMarkup(
    <TaskToastMarkdown content="Finished **deploy** with `pnpm build` and [logs](https://example.com/logs)." />,
  );

  assert.match(html, /<strong[^>]*>deploy<\/strong>/);
  assert.match(html, /<code[^>]*>pnpm build<\/code>/);
  assert.match(
    html,
    /<a[^>]*href="https:\/\/example.com\/logs"[^>]*>logs<\/a>/,
  );
});

test("keeps heavyweight markdown out of task toast bodies", () => {
  const html = renderToStaticMarkup(
    <TaskToastMarkdown
      content={
        '![graph](https://example.com/graph.png)\n\n```ts\nconsole.log("wide")\n```'
      }
    />,
  );

  assert.doesNotMatch(html, /<img\b/);
  assert.doesNotMatch(html, /<pre\b/);
});
