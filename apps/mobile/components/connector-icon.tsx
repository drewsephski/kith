import { resolveBrandLogo } from "@rakazo/ui-tokens/brand-logos";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri, SvgXml } from "react-native-svg";
import { native, useResolvedAppearance, useThemedStyles } from "../lib/native";

/** Shared SVGL artwork, with catalog and initials as fallbacks for unknown brands. */
export function ConnectorIcon({
  name,
  logo,
  brand,
  fallbackName,
  size = 36,
}: {
  name: string;
  logo?: string | null;
  brand?: string;
  fallbackName?: string;
  size?: number;
}) {
  const styles = useThemedStyles(createStyles);
  const [failedLogos, setFailedLogos] = useState<ReadonlySet<string>>(() => new Set());
  const appearance = useResolvedAppearance();
  const asset = resolveBrandLogo(brand, name, fallbackName);
  const xml = asset?.artwork?.[appearance];
  const source = asset?.routes[appearance] ?? logo;
  const uri =
    source && !failedLogos.has(source) ? source : logo && !failedLogos.has(logo) ? logo : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}
    >
      {xml ? (
        <SvgXml xml={xml} width={size - 8} height={size - 8} />
      ) : uri ? (
        /\.svg(?:[?#]|$)/i.test(uri) ? (
          <SvgUri
            uri={uri}
            width={size - 8}
            height={size - 8}
            onError={() => setFailedLogos((current) => new Set([...current, uri]))}
          />
        ) : (
          <Image
            source={{ uri }}
            resizeMode="contain"
            onError={() => setFailedLogos((current) => new Set([...current, uri]))}
            style={{ width: size - 8, height: size - 8 }}
          />
        )
      ) : (
        <Text style={styles.letter}>{(name.trim()[0] || "?").toUpperCase()}</Text>
      )}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    frame: {
      borderRadius: 10,
      backgroundColor: native.fillPressed,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    letter: { color: native.label, fontSize: 16, fontWeight: "600" },
  });
}
