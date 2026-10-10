import { Stack, useNavigation } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { floatingHeaderOptions, glassHeaderOptions } from "../../components/glass-title";
import { MenuPickerMenu } from "../../components/menu-picker";
import { NativeSymbol } from "../../components/native-symbol";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens } from "../../lib/native";
import { registerSettingsSheet, settingsSheetCloser } from "../../lib/settings-sheet";

/** Settings pages share one stack, which the root layout presents as a sheet on iOS. */
export default function SettingsLayout() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const sheet = useNavigation();
  const close = settingsSheetCloser(sheet);
  const sections = [
    { name: "account", label: t("Account"), symbol: "person.crop.circle" },
    { name: "models", label: t("Models"), symbol: "cpu" },
    { name: "voice", label: t("Voice"), symbol: "speaker.wave.2" },
    { name: "integrations", label: t("Integrations"), symbol: "link" },
  ] as const;

  useEffect(() => registerSettingsSheet(settingsSheetCloser(sheet)), [sheet]);

  return (
    <Stack
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: tokens.background },
        ...floatingHeaderOptions(),
        headerTintColor: tokens.foreground,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        // Section navigation lives in the Settings menu instead of the back-button history.
        headerBackButtonMenuEnabled: false,
        contentStyle: { backgroundColor: String(native.page) },
        ...(Platform.OS === "ios"
          ? {
              unstable_headerRightItems: () => [
                {
                  type: "menu" as const,
                  label: t("Settings"),
                  accessibilityLabel: t("Settings"),
                  icon: { type: "sfSymbol" as const, name: "list.bullet" },
                  menu: {
                    items: sections.map((section) => ({
                      type: "action" as const,
                      label: section.label,
                      icon: { type: "sfSymbol" as const, name: section.symbol },
                      state: route.name === section.name ? ("on" as const) : ("off" as const),
                      onPress: () => navigation.navigate(section.name, undefined, { pop: true }),
                    })),
                  },
                },
              ],
            }
          : {
              headerRight: () => (
                <MenuPickerMenu
                  label={t("Settings")}
                  choices={sections.map((section) => ({ key: section.name, label: section.label }))}
                  value={route.name}
                  onChange={(name) => navigation.navigate(name, undefined, { pop: true })}
                >
                  <View
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={t("Settings")}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NativeSymbol
                      ios="list.bullet"
                      android="list"
                      color={tokens.foreground}
                      size={22}
                    />
                  </View>
                </MenuPickerMenu>
              ),
            }),
        // The first page closes the sheet, or returns Home when opened by a cold deep link.
        // The inner stack has no native back arrow on its first page.
        ...(navigation.getState().routes[0]?.key === route.key
          ? Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button" as const,
                    label: t("Dismiss"),
                    icon: { type: "sfSymbol" as const, name: "xmark" as const },
                    onPress: close,
                  },
                ],
              }
            : {
                headerBackVisible: false,
                headerLeft: ({ tintColor }) => (
                  <HeaderBackButton
                    accessibilityLabel={t("Back")}
                    displayMode="minimal"
                    tintColor={tintColor}
                    onPress={close}
                  />
                ),
              }
          : null),
      })}
    >
      <Stack.Screen
        name="account"
        options={{
          ...glassHeaderOptions(t("Account")),
          ...(Platform.OS === "ios" ? { headerTitle: t("Settings") } : null),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen name="ai-data-sharing" options={glassHeaderOptions(t("AI data sharing"))} />
      <Stack.Screen name="archived-bots" options={{ title: t("Archived bots") }} />
      <Stack.Screen name="change-password" options={{ title: t("Change password") }} />
      <Stack.Screen name="models" options={glassHeaderOptions(t("Models"))} />
      <Stack.Screen name="voice" options={glassHeaderOptions(t("Voice"))} />
      <Stack.Screen name="integrations" options={glassHeaderOptions(t("Integrations"))} />
      <Stack.Screen
        name="integration-setup"
        options={glassHeaderOptions(t("Server integrations"))}
      />
    </Stack>
  );
}
