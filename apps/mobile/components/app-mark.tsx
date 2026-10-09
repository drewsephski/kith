import { Image, StyleSheet, View } from "react-native";
import appMark from "../../../packages/ui-tokens/assets/kith-companion.png";

const MARK = 56;

export function AppMark() {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.mark}
    >
      <Image source={appMark} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: MARK,
    height: MARK,
    alignSelf: "center",
  },
  image: {
    width: MARK,
    height: MARK,
  },
});
