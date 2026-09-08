/** 会话级机器选择器选项构建（纯函数）：档位联动、默认值与展示名 */
import { describe, expect, it } from "vitest";
import type { SandboxMachine } from "../../../services/api/sandbox";
import {
  SANDBOX_MACHINE_AGENT_OPTION_KEY,
  buildSandboxMachineOption,
  shouldShowSandboxMachineOption,
} from "../sandboxOption";

const machines: SandboxMachine[] = [
  {
    machine_id: "mac1",
    name: "MacBook",
    platform: "darwin",
    version: "0.3.0",
    confirm_policy: "all",
    online: true,
  },
  {
    machine_id: "srv1",
    name: "Server",
    platform: "linux",
    version: "0.3.0",
    confirm_policy: "none",
    online: true,
  },
];
const t = (k: string) => k;

describe("shouldShowSandboxMachineOption", () => {
  it("仅本地档且存在机器时显示", () => {
    expect(shouldShowSandboxMachineOption("local", machines)).toBe(true);
    expect(shouldShowSandboxMachineOption("cloud", machines)).toBe(false);
    expect(shouldShowSandboxMachineOption("local", [])).toBe(false);
  });
});

describe("buildSandboxMachineOption", () => {
  it("首档为「自动（默认机）」，随后按机器生成档位", () => {
    const option = buildSandboxMachineOption(machines, "MacBook", t)!;
    expect(option).not.toBeNull();
    expect(option.options?.[0]).toMatchObject({
      value: "",
      label_key: "agentOptions.sandboxMachine.auto",
    });
    expect(option.options?.map((o) => o.value)).toEqual(["", "mac1", "srv1"]);
    expect(option.default).toBe("mac1"); // 默认机优先，无默认取首台
  });

  it("无机器返回 null（选择器整体隐藏）", () => {
    expect(buildSandboxMachineOption([], null, t)).toBeNull();
  });

  it("选项键固定为 sandbox_machine_id（与后端 agent_options 契约一致）", () => {
    expect(SANDBOX_MACHINE_AGENT_OPTION_KEY).toBe("sandbox_machine_id");
  });
});

// ---------------------------------------------------------------------------
// 离线机保留展示（记忆层）：置灰可选但标注离线；默认机置顶；仅在线机参与
// ---------------------------------------------------------------------------

function machine(id: string, opts: Partial<Parameters<typeof buildSandboxMachineOption>[0][number]> = {}) {
  return {
    machine_id: id,
    name: id.toUpperCase(),
    platform: "linux",
    version: "0.4.0",
    confirm_policy: "all",
    online: true,
    last_seen: 1700_000_000,
    ...opts,
  };
}

test("buildSandboxMachineOption disables offline machines and appends offline hint", () => {
  const t = (key: string) => key;
  const option = buildSandboxMachineOption(
    [machine("on1"), machine("off1", { online: false })],
    null,
    t,
  );
  expect(option).not.toBeNull();
  const offline = option!.options!.find((o) => o.value === "off1");
  expect(offline?.disabled).toBe(true);
  expect(String(offline?.label)).toContain("agentOptions.sandboxMachine.offline");
  const online = option!.options!.find((o) => o.value === "on1");
  expect(online?.disabled).toBeUndefined();
});

test("buildSandboxMachineOption orders default machine first, online before offline", () => {
  const t = (key: string) => key;
  const option = buildSandboxMachineOption(
    [machine("off1", { online: false }), machine("on2"), machine("on1")],
    "on2",
    t,
  );
  const values = option!.options!.map((o) => o.value);
  // 首档「自动」，随后默认机 on2 置顶，再其余在线机（按列表序），最后离线机
  expect(values).toEqual(["", "on2", "on1", "off1"]);
});

test("shouldShowSandboxMachineOption hides selector only when no machine is online", () => {
  expect(
    shouldShowSandboxMachineOption("local", [
      machine("off1", { online: false }),
      machine("off2", { online: false }),
    ]),
  ).toBe(false);
  expect(
    shouldShowSandboxMachineOption("local", [
      machine("off1", { online: false }),
      machine("on1"),
    ]),
  ).toBe(true);
  // 旧数据（无 online 字段）按在线处理，兼容迁移窗口
  expect(
    shouldShowSandboxMachineOption("local", [
      { ...machine("old1"), online: undefined } as never,
    ]),
  ).toBe(true);
});
