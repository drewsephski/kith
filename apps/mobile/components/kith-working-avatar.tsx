import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Image, StyleSheet } from "react-native";
import still from "../../../packages/ui-tokens/assets/kith-companion.png";
import animation from "../../../packages/ui-tokens/assets/kith-companion-working.gif";

/** Native image decoding keeps the supplied clip off the JavaScript animation loop. */
export function KithWorkingAvatar({ active, size = 36 }: { active: boolean; size?: number }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => undefined);
    const app = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);

  return (
    <Image
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={active && foreground && !reducedMotion && !failed ? animation : still}
      resizeMode="contain"
      style={[styles.image, { width: size, height: size }]}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({ image: { flexShrink: 0 } });
