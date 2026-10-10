import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  FlatListProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  ViewStyle,
} from "react-native";
import {
  Animated,
  FlatList as NativeFlatList,
  ScrollView as NativeScrollView,
  View,
} from "react-native";
import { useMobileTokens } from "../lib/native";
import { scrollIndicatorGeometry } from "../lib/scroll-indicator";

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type ScrollMetrics = { viewport: number; content: number; startInset: number; endInset: number };

const frameStyle: ViewStyle = { flexGrow: 1, flexShrink: 1, overflow: "hidden" };
const scrollStyle: ViewStyle = { flexGrow: 1, flexShrink: 1 };

function useScrollIndicator(horizontal: boolean, inverted: boolean, enabled: boolean) {
  const tokens = useMobileTokens();
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    viewport: 0,
    content: 0,
    startInset: 0,
    endInset: 0,
  });
  const metricsRef = useRef(metrics);
  const offset = useRef(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const position = useRef(new Animated.Value(0)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  function updateMetrics(next: Partial<ScrollMetrics>) {
    const previous = metricsRef.current;
    const updated = { ...previous, ...next };
    if (
      Object.keys(updated).some(
        (key) => updated[key as keyof ScrollMetrics] !== previous[key as keyof ScrollMetrics],
      )
    ) {
      metricsRef.current = updated;
      setMetrics(updated);
      const geometry = scrollIndicatorGeometry({
        viewport: updated.viewport - updated.startInset - updated.endInset,
        content: updated.content,
        offset: offset.current,
        inverted,
      });
      if (geometry) position.setValue(geometry.position);
    }
  }

  function onScroll(event: ScrollEvent) {
    const { contentOffset, contentInset } = event.nativeEvent;
    const startInset = Math.max(0, horizontal ? contentInset.left : contentInset.top);
    const endInset = Math.max(0, horizontal ? contentInset.right : contentInset.bottom);
    updateMetrics({ startInset, endInset });
    offset.current = (horizontal ? contentOffset.x : contentOffset.y) + startInset;
    const geometry = scrollIndicatorGeometry({
      viewport: metricsRef.current.viewport - startInset - endInset,
      content: metricsRef.current.content,
      offset: offset.current,
      inverted,
    });
    if (!enabled || !geometry) return;
    position.setValue(geometry.position);
    opacity.stopAnimation();
    opacity.setValue(1);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }, 650);
  }

  const geometry = scrollIndicatorGeometry({
    viewport: metrics.viewport - metrics.startInset - metrics.endInset,
    content: metrics.content,
    offset: offset.current,
    inverted,
  });
  const indicator: ReactNode =
    enabled && geometry ? (
      <Animated.View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          {
            position: "absolute",
            borderRadius: 2,
            backgroundColor: tokens.mutedForeground,
            opacity,
          },
          horizontal
            ? {
                height: 3,
                width: geometry.thumb,
                bottom: 3,
                left: metrics.startInset + 8,
                transform: [{ translateX: position }],
              }
            : {
                width: 3,
                height: geometry.thumb,
                right: 3,
                top: metrics.startInset + 8,
                transform: [{ translateY: position }],
              },
        ]}
      />
    ) : null;

  return { indicator, onScroll, updateMetrics };
}

export type ScrollView = NativeScrollView;

/** Native scrolling and refs stay intact; the indicator never takes layout space. */
export function ScrollView({
  ref,
  style,
  horizontal = false,
  onScroll,
  onLayout,
  onContentSizeChange,
  scrollEventThrottle,
  showsVerticalScrollIndicator,
  showsHorizontalScrollIndicator,
  ...props
}: ScrollViewProps & { ref?: Ref<NativeScrollView> }) {
  const enabled = horizontal
    ? showsHorizontalScrollIndicator !== false
    : showsVerticalScrollIndicator !== false;
  const indicator = useScrollIndicator(Boolean(horizontal), false, enabled);
  // Chip rows intentionally hide their indicator and keep their intrinsic height.
  if (horizontal && !enabled) {
    return (
      <NativeScrollView
        ref={ref}
        style={style}
        horizontal
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={scrollEventThrottle}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        showsHorizontalScrollIndicator={false}
        {...props}
      />
    );
  }
  return (
    <View style={[frameStyle, style]}>
      <NativeScrollView
        {...props}
        ref={ref}
        style={scrollStyle}
        horizontal={horizontal}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        onLayout={(event) => {
          indicator.updateMetrics({
            viewport: horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height,
          });
          onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          indicator.updateMetrics({ content: horizontal ? width : height });
          onContentSizeChange?.(width, height);
        }}
        onScroll={(event) => {
          indicator.onScroll(event);
          onScroll?.(event);
        }}
      />
      {indicator.indicator}
    </View>
  );
}

export type FlatList<Item> = NativeFlatList<Item>;

export function FlatList<Item>({
  ref,
  style,
  horizontal = false,
  inverted = false,
  onScroll,
  onLayout,
  onContentSizeChange,
  scrollEventThrottle,
  showsVerticalScrollIndicator,
  showsHorizontalScrollIndicator,
  ...props
}: FlatListProps<Item> & { ref?: Ref<NativeFlatList<Item>> }) {
  const enabled = horizontal
    ? showsHorizontalScrollIndicator !== false
    : showsVerticalScrollIndicator !== false;
  const indicator = useScrollIndicator(Boolean(horizontal), Boolean(inverted), enabled);
  return (
    <View style={[frameStyle, style]}>
      <NativeFlatList
        {...props}
        ref={ref}
        style={scrollStyle}
        horizontal={horizontal}
        inverted={inverted}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        onLayout={(event) => {
          indicator.updateMetrics({
            viewport: horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height,
          });
          onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          indicator.updateMetrics({ content: horizontal ? width : height });
          onContentSizeChange?.(width, height);
        }}
        onScroll={(event) => {
          indicator.onScroll(event);
          onScroll?.(event);
        }}
      />
      {indicator.indicator}
    </View>
  );
}
