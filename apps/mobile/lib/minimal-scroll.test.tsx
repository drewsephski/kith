// @vitest-environment jsdom
import type { ReactNode, Ref } from "react";
import { act, createRef, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import type { FlatListProps, ScrollViewProps } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { FlatList, ScrollView } from "../components/minimal-scroll";

const captures = vi.hoisted(() => ({
  scroll: null as ScrollViewProps | null,
  list: null as FlatListProps<string> | null,
  scrollTo: vi.fn(),
  scrollToEnd: vi.fn(),
}));

vi.mock("./native", () => ({ useMobileTokens: () => ({ mutedForeground: "gray" }) }));
vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  class Value {
    value: number;
    constructor(value: number) {
      this.value = value;
    }
    setValue(value: number) {
      this.value = value;
    }
    stopAnimation() {}
  }
  return {
    View,
    Animated: { Value, View, timing: () => ({ start: () => undefined }) },
    ScrollView: ({ ref, ...props }: ScrollViewProps & { ref?: Ref<unknown> }) => {
      captures.scroll = props;
      useImperativeHandle(ref, () => ({ scrollTo: captures.scrollTo }));
      return <View>{props.children}</View>;
    },
    FlatList: ({ ref, ...props }: FlatListProps<string> & { ref?: Ref<unknown> }) => {
      captures.list = props;
      useImperativeHandle(ref, () => ({ scrollToEnd: captures.scrollToEnd }));
      return <View />;
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("preserves native scroll refs and forwards layout, content, and scrolling callbacks", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const ref = createRef<ScrollView>();
  const onLayout = vi.fn();
  const onContentSizeChange = vi.fn();
  const onScroll = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ScrollView
          ref={ref}
          onLayout={onLayout}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
          keyboardShouldPersistTaps="handled"
        />,
      ),
    );
    ref.current?.scrollTo({ y: 200 });
    expect(captures.scrollTo).toHaveBeenCalledWith({ y: 200 });
    const layout = { nativeEvent: { layout: { height: 500, width: 300 } } } as Parameters<
      NonNullable<ScrollViewProps["onLayout"]>
    >[0];
    const scroll = {
      nativeEvent: {
        contentOffset: { x: 0, y: 250 },
        contentInset: { top: 60, bottom: 20, left: 0, right: 0 },
      },
    } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0];
    await act(async () => {
      captures.scroll?.onLayout?.(layout);
      captures.scroll?.onContentSizeChange?.(300, 1000);
      captures.scroll?.onScroll?.(scroll);
    });
    expect(onLayout).toHaveBeenCalledWith(layout);
    expect(onContentSizeChange).toHaveBeenCalledWith(300, 1000);
    expect(onScroll).toHaveBeenCalledWith(scroll);
    expect(captures.scroll?.keyboardShouldPersistTaps).toBe("handled");
    expect(captures.scroll?.showsVerticalScrollIndicator).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps inverted lists virtualized and exposes their native imperative ref", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const ref = createRef<FlatList<string>>();
  const renderItem = vi.fn(() => null);
  const data = ["message"];
  try {
    await act(async () =>
      root.render(<FlatList ref={ref} inverted data={data} renderItem={renderItem} />),
    );
    ref.current?.scrollToEnd({ animated: false });
    expect(captures.scrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(captures.list?.inverted).toBe(true);
    expect(captures.list?.data).toBe(data);
    expect(captures.list?.renderItem).toBe(renderItem);
  } finally {
    await act(async () => root.unmount());
  }
});
