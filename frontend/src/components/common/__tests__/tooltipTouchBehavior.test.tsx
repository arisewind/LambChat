// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

/**
 * 触屏行为契约：
 * - 轻点（tap）不应弹 tooltip（浏览器在 tap 后会派发合成 mouseenter）
 * - 手指滑动（滚动意图）应取消长按计时
 * - 长按 500ms 才显示，2s 后自动隐藏
 * - 触屏之后隔一段时间，真实鼠标 hover 仍可显示
 */
describe("Tooltip touch behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const view = render(
      <Tooltip content="运行中">
        <span data-testid="icon" />
      </Tooltip>,
    );
    return {
      icon: view.getByTestId("icon"),
      bubble: () => within(document.body).queryByText("运行中"),
    };
  }

  it("does not show on tap: synthetic mouseenter after touch is ignored", () => {
    const { icon, bubble } = setup();
    fireEvent.touchStart(icon, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(icon);
    // 移动端浏览器在 touchend 后派发合成 mouse 事件
    fireEvent.mouseEnter(icon);
    expect(bubble()).not.toBeInTheDocument();
  });

  it("cancels the long-press tooltip when the finger moves (scroll)", () => {
    const { icon, bubble } = setup();
    fireEvent.touchStart(icon, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(icon, { touches: [{ clientX: 100, clientY: 130 }] });
    vi.advanceTimersByTime(500);
    expect(bubble()).not.toBeInTheDocument();
  });

  it("shows after a deliberate 500ms long press and auto-hides", () => {
    const { icon, bubble } = setup();
    fireEvent.touchStart(icon, { touches: [{ clientX: 100, clientY: 100 }] });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bubble()).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bubble()).not.toBeInTheDocument();
  });

  it("still shows for real mouse hover after a touch has settled", () => {
    const { icon, bubble } = setup();
    fireEvent.touchStart(icon, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(icon);
    // 合成 mouseenter（tap 后立刻）被忽略
    fireEvent.mouseEnter(icon);
    expect(bubble()).not.toBeInTheDocument();
    // 触屏静默期过后，真实鼠标 hover 恢复可用
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.mouseEnter(icon);
    expect(bubble()).toBeInTheDocument();
  });
});
