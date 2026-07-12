import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../ResponsiveSection.tsx", import.meta.url),
  "utf8",
);

test("renders responsive screenshots at their full aspect ratio", () => {
  expect(source).toMatch(
    /<img[\s\S]*?className="w-auto max-w-full max-h-44 sm:max-h-72 lg:max-h-80 object-contain rounded-xl"/,
  );
  expect(source).not.toMatch(/<ImageWithSkeleton[\s\S]*?\binline\b/);
});
