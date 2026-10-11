import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { BotMemberPicker } from "../components/bot-member-picker";
import { ScrollView } from "../components/minimal-scroll";
import { NativeActionButton } from "../components/native-action-button";
import type { MobileBot } from "../lib/api";
import { captureMobileScreenScope, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";

export default function NewGroup() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const scopeCurrent = captureMobileScreenScope();
    const current = () => active && scopeCurrent();
    setLoading(true);
    setLoadError(null);
    void rpc<MobileBot[]>("bots/list")
      .then((nextBots) => {
        if (current()) setBots(nextBots.filter((bot) => !bot.archivedAt));
      })
      .catch((cause) => {
        if (current()) setLoadError(errorText(cause, t("Could not load bots")));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function create() {
    if (
      !name.trim() ||
      selected.length < GROUP_MEMBER_MIN ||
      selected.length > GROUP_MEMBER_MAX ||
      pending
    )
      return;
    const current = captureMobileScreenScope();
    setPending(true);
    setError(null);
    try {
      const group = await rpc<{ id: string; name: string }>("groups/create", {
        name: name.trim(),
        botIds: selected,
      });
      if (!current()) return;
      router.replace({
        pathname: "/group-thread",
        params: { groupId: group.id, name: group.name },
      });
    } catch (err) {
      setError(errorText(err, t("Could not create group")));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("New group") }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={{ padding: 24 }}
      >
        {loading ? <ActivityIndicator accessibilityLabel={t("Loading members")} /> : null}
        {loadError ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {loadError}
            </Text>
            <NativeActionButton
              label={t("Retry")}
              prominence="plain"
              onPress={() => setLoadAttempt((value) => value + 1)}
            />
          </View>
        ) : null}
        {!loading && !loadError && !bots.length ? (
          <Text style={{ color: tokens.mutedForeground }}>
            {t("Create a bot before starting a group.")}
          </Text>
        ) : null}
        <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>{t("Name")}</Text>
        <TextInput
          accessibilityLabel={t("Group name")}
          editable={!loading && !loadError && !pending}
          value={name}
          onChangeText={setName}
          placeholder={t("Name this group")}
          placeholderTextColor={tokens.mutedForeground}
          style={{
            marginTop: 8,
            backgroundColor: native.fill,
            borderRadius: 11,
            padding: 14,
            color: tokens.foreground,
            fontSize: 16,
          }}
        />
        <Text style={{ color: tokens.mutedForeground, fontSize: 14, marginTop: 20 }}>
          {t("Members")}
        </Text>
        <BotMemberPicker
          bots={bots}
          selected={selected}
          onChange={setSelected}
          disabled={pending || loading || Boolean(loadError)}
        />
        {error ? <Text style={{ color: tokens.destructive, marginTop: 12 }}>{error}</Text> : null}
        <NativeActionButton
          disabled={
            loading ||
            Boolean(loadError) ||
            !name.trim() ||
            selected.length < GROUP_MEMBER_MIN ||
            selected.length > GROUP_MEMBER_MAX ||
            pending
          }
          label={pending ? t("Creating…") : t("Create group")}
          onPress={() => void create()}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </>
  );
}
