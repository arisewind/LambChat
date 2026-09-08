import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function readRepoFile(...segments: string[]): string {
  return readFileSync(
    resolve(import.meta.dirname, "../..", ...segments),
    "utf8",
  );
}

const PX_TEXT_CLASS = /text-\[\d+(?:\.\d+)?px\]/;

// 命名字号类（text-xs / text-sm / text-base / text-lg / text-xl / text-2xl…）
// 自带的默认 line-height 与数字 token「只声明 font-size」的约定冲突，
// 且会让全站出现两套字号刻度，统一迁移到数字 rem token 刻度后禁止回流。
const NAMED_TEXT_SIZE_CLASS =
  /(?<![\w-])text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/;

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      // 测试目录自身的正则字面量不算业务代码
      if (entry.name === "__tests__" || entry.name === "node_modules") {
        return [];
      }
      return collectSourceFiles(resolve(dir, entry.name));
    }
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [resolve(dir, entry.name)] : [];
  });
}

test("src 不允许写死像素字号：禁止 text-[Npx]，一律用 rem token 刻度", () => {
  const offenders = collectSourceFiles(
    resolve(import.meta.dirname, "../..", "src"),
  ).flatMap(
    (file) =>
      readFileSync(file, "utf8")
        .match(PX_TEXT_CLASS)
        ?.map((match) => `${file}: ${match}`) ?? [],
  );

  expect(
    offenders.slice(0, 10),
    `发现 ${offenders.length} 处像素字号工具类（前 10 条）：\n${offenders
      .slice(0, 10)
      .join("\n")}`,
  ).toEqual([]);
});

test("tailwind config 定义 rem 字号 token 刻度", () => {
  const config = readRepoFile("tailwind.config.js");

  expect(config).toMatch(/fontSize:\s*\{/);
  // token 只声明 font-size（字符串形式），不附带 line-height，保持与原 text-[Npx] 行为一致
  expect(config).toMatch(/['"]?11['"]?:\s*"0\.6875rem"/);
  expect(config).toMatch(/["']?13["']?:\s*"0\.8125rem"/);
  expect(config).toMatch(/["']?15["']?:\s*"0\.9375rem"/);
  // 命名刻度迁移承接档位：base/lg/2xl/3xl/4xl 对应的数字 token 必须存在
  expect(config).toMatch(/["']?16["']?:\s*"1rem"/);
  expect(config).toMatch(/["']?18["']?:\s*"1\.125rem"/);
  expect(config).toMatch(/["']?24["']?:\s*"1\.5rem"/);
  expect(config).toMatch(/["']?30["']?:\s*"1\.875rem"/);
  expect(config).toMatch(/["']?36["']?:\s*"2\.25rem"/);
  expect(config).not.toMatch(/fontSize:\s*\{[^}]*px/);
});

test("src 字号统一数字 rem token：禁止命名字号类（xs/sm/base/lg/xl 一族）", () => {
  const offenders = collectSourceFiles(
    resolve(import.meta.dirname, "../..", "src"),
  ).flatMap(
    (file) =>
      readFileSync(file, "utf8")
        .match(NAMED_TEXT_SIZE_CLASS)
        ?.map((match) => `${file}: ${match}`) ?? [],
  );

  expect(
    offenders.slice(0, 10),
    `发现 ${offenders.length} 处命名字号类（前 10 条）：\n${offenders
      .slice(0, 10)
      .join("\n")}`,
  ).toEqual([]);
});
