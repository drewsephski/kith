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
  framed = true,
}: {
  name: string;
  logo?: string | null;
  brand?: string;
  fallbackName?: string;
  size?: number;
  framed?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const [failedLogos, setFailedLogos] = useState<ReadonlySet<string>>(() => new Set());
  const appearance = useResolvedAppearance();
  const artworkSize = framed ? size - 8 : size;
  const asset = resolveBrandLogo(brand, name, fallbackName);
  const xml = asset?.artwork?.[appearance];
  const source = asset?.routes[appearance] ?? logo;
  const uri =
    source && !failedLogos.has(source) ? source : logo && !failedLogos.has(logo) ? logo : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }, !framed && styles.plain]}
    >
      {xml ? (
        <SvgXml xml={xml} width={artworkSize} height={artworkSize} />
      ) : uri ? (
        /\.svg(?:[?#]|$)/i.test(uri) ? (
          <SvgUri
            uri={uri}
            width={artworkSize}
            height={artworkSize}
            onError={() => setFailedLogos((current) => new Set([...current, uri]))}
          />
        ) : (
          <Image
            source={{ uri }}
            resizeMode="contain"
            onError={() => setFailedLogos((current) => new Set([...current, uri]))}
            style={{ width: artworkSize, height: artworkSize }}
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
    plain: { borderRadius: 0, backgroundColor: "transparent" },
  });
}
