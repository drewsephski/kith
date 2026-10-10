// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AnimatedIconHandle } from "./use-icon-animation.js";
import { useIconAnimation } from "./use-icon-animation.js";

const animation = vi.hoisted(() => ({ start: vi.fn(), set: vi.fn(), reduced: false }));
vi.mock("framer-motion", () => ({
  useAnimation: () => animation,
  useReducedMotion: () => animation.reduced,
}));

it("supports parent-controlled focus, reduced motion, and standalone hover callbacks", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const ref = createRef<AnimatedIconHandle>();
  const enter = vi.fn();
  function Fixture({ controlled }: { controlled: boolean }) {
    const { hoverProps } = useIconAnimation(controlled ? ref : null, enter);
    return <div {...hoverProps} />;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const hover = (type: string) =>
    act(() => container.firstElementChild!.dispatchEvent(new MouseEvent(type, { bubbles: true })));
  try {
    act(() => root.render(<Fixture controlled={false} />));
    hover("mouseover");
    expect(animation.start).toHaveBeenCalledWith("animate");
    expect(enter).toHaveBeenCalledTimes(1);
    hover("mouseout");
    expect(animation.start).toHaveBeenLastCalledWith("normal");
    animation.start.mockClear();
    act(() => root.render(<Fixture controlled />));
    hover("mouseover");
    expect(animation.start).not.toHaveBeenCalled();
    act(() => ref.current!.startAnimation());
    expect(animation.start).toHaveBeenCalledWith("animate");
    animation.start.mockClear();
    animation.reduced = true;
    act(() => root.render(<Fixture controlled />));
    expect(animation.set).toHaveBeenCalledWith("normal");
    act(() => ref.current!.startAnimation());
    expect(animation.start).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
