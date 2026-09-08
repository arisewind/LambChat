import {
  appendToolStreamingPreview,
  pickStreamingArgText,
} from "../useToolStreamingLabel";

// ── pickStreamingArgText：取参数里正在生成的文本（最后一个字符串值） ──

test("pickStreamingArgText returns the last string value in key order", () => {
  expect(
    pickStreamingArgText({ file_path: "/tmp/a.py", content: "print(1)" }),
  ).toBe("print(1)");
});

test("pickStreamingArgText skips non-string and empty values", () => {
  expect(pickStreamingArgText({ n: 1, ok: true, s: "x", bad: "" })).toBe("x");
  expect(pickStreamingArgText({ nested: { deep: "y" } })).toBe("");
  expect(pickStreamingArgText({})).toBe("");
});

// ── appendToolStreamingPreview：标签拼接与去重 ──

test("returns base label unchanged when not streaming", () => {
  expect(appendToolStreamingPreview("写入 /a.py", "print(1)", false)).toBe(
    "写入 /a.py",
  );
});

test("appends the flattened tail preview after the base label", () => {
  expect(appendToolStreamingPreview("写入 /a.py", "print(1)", true)).toBe(
    "写入 /a.py print(1)",
  );
  // 多行文本压平成单行预览
  expect(appendToolStreamingPreview("执行", "line1\nline2", true)).toBe(
    "执行 line1 line2",
  );
});

test("keeps only the last 80 chars of long streaming text", () => {
  const tail = "甲乙丙丁".repeat(20); // 80 chars
  const label = appendToolStreamingPreview(
    "写入",
    "前情提要".repeat(50) + tail,
    true,
  );
  expect(label).toBe(`写入 ${tail}`);
});

test("skips the preview when the streaming text is already in the label", () => {
  // 路径/命令已在标签里逐字增长的工具不重复追加
  expect(appendToolStreamingPreview("读取 /tmp/a.py", "/tmp/a.py", true)).toBe(
    "读取 /tmp/a.py",
  );
});
