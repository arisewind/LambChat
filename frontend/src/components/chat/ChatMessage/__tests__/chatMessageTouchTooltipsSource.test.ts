import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

// Touch devices never show native title attributes; icon-only affordances in
// the chat message area must surface labels through the shared Tooltip
// (hover on desktop, deliberate 500ms long-press on touch).
describe("chat message touch tooltips", () => {
  const migrated = [
    "../index.tsx",
    "../FeedbackButtons.tsx",
    "../ShareButton.tsx",
    "../BookmarkButton.tsx",
    "../RevealArtifactsSummary.tsx",
  ];

  it.each(migrated)("%s uses Tooltip instead of native titles", (rel) => {
    const source = read(rel);
    expect(source).toMatch(/from "\.\.\/\.\.\/common\/Tooltip"/);
    expect(source).toMatch(/<Tooltip\s+content=/);
    expect(source).not.toMatch(/title=\{/);
  });
});
