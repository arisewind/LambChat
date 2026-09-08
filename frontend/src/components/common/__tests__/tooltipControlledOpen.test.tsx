// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

describe("Tooltip controlled open", () => {
  it("shows the bubble immediately when open is true", () => {
    render(
      <Tooltip content="运行中" open>
        <span data-testid="icon" />
      </Tooltip>,
    );
    const bubble = within(document.body).getByText("运行中");
    expect(bubble).toHaveClass("fixed", "pointer-events-none");
  });

  it("does not suppress hover behavior when open is false", () => {
    const view = render(
      <Tooltip content="运行中" open={false}>
        <span data-testid="icon" />
      </Tooltip>,
    );
    expect(within(document.body).queryByText("运行中")).not.toBeInTheDocument();
    fireEvent.mouseEnter(view.getByTestId("icon"));
    expect(within(document.body).getByText("运行中")).toBeInTheDocument();
  });

  it("places a left-edge tooltip to the right of its trigger", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    const view = render(
      <Tooltip content="侧边栏提示">
        <span data-testid="icon" />
      </Tooltip>,
    );
    const trigger = view.getByTestId("icon");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 8,
      top: 260,
      right: 32,
      bottom: 284,
      width: 24,
      height: 24,
    } as DOMRect);
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(within(document.body).getByText("侧边栏提示")).toHaveAttribute(
        "data-placement",
        "right",
      );
    });
  });

  it("keeps a bottom tooltip inside the viewport and shifts its arrow", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(240);
    const view = render(
      <Tooltip content="这是一个很长的提示内容" placement="bottom">
        <span data-testid="icon" />
      </Tooltip>,
    );
    const trigger = view.getByTestId("icon");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 4,
      top: 180,
      right: 28,
      bottom: 204,
      width: 24,
      height: 24,
    } as DOMRect);
    fireEvent.mouseEnter(trigger);

    const bubble = within(document.body).getByText("这是一个很长的提示内容");
    await waitFor(() => {
      expect(bubble).toHaveAttribute("data-placement", "bottom");
      expect(bubble).toHaveStyle({ left: "8px" });
      expect(bubble.querySelector("[data-tooltip-arrow]")).toHaveStyle({
        left: "8px",
      });
    });
  });

  it("places a right-edge tooltip to the left of its trigger", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    const view = render(
      <Tooltip content="右侧提示">
        <span data-testid="icon" />
      </Tooltip>,
    );
    const trigger = view.getByTestId("icon");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 760,
      top: 260,
      right: 784,
      bottom: 284,
      width: 24,
      height: 24,
    } as DOMRect);
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(within(document.body).getByText("右侧提示")).toHaveAttribute(
        "data-placement",
        "left",
      );
    });
  });

  it("flips vertically to the side with more space when away from edges", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    const nearTop = render(
      <Tooltip content="靠上提示">
        <span data-testid="icon" />
      </Tooltip>,
    );
    const topTrigger = nearTop.getByTestId("icon");
    vi.spyOn(topTrigger, "getBoundingClientRect").mockReturnValue({
      left: 300,
      top: 40,
      right: 324,
      bottom: 64,
      width: 24,
      height: 24,
    } as DOMRect);
    fireEvent.mouseEnter(topTrigger);

    await waitFor(() => {
      expect(within(document.body).getByText("靠上提示")).toHaveAttribute(
        "data-placement",
        "bottom",
      );
    });
    nearTop.unmount();

    const nearBottom = render(
      <Tooltip content="靠下提示">
        <span data-testid="icon" />
      </Tooltip>,
    );
    const bottomTrigger = nearBottom.getByTestId("icon");
    vi.spyOn(bottomTrigger, "getBoundingClientRect").mockReturnValue({
      left: 300,
      top: 500,
      right: 324,
      bottom: 524,
      width: 24,
      height: 24,
    } as DOMRect);
    fireEvent.mouseEnter(bottomTrigger);

    await waitFor(() => {
      expect(within(document.body).getByText("靠下提示")).toHaveAttribute(
        "data-placement",
        "top",
      );
    });
  });
});
