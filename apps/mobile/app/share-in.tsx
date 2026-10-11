import { ATTACHMENT_MAX_BYTES } from "@rakazo/contracts";
import { inferAttachmentMimeType } from "@rakazo/core";
import { File, Paths } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
import type { SharePayload } from "expo-sharing";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ScrollView } from "../components/minimal-scroll";
import { NativeActionButton } from "../components/native-action-button";
import type { MobileBot, MobileGroup, MobileMe } from "../lib/api";
import { captureMobileScreenScope, currentApiBase, loadSessionToken, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { parseIncomingShare } from "../lib/incoming-share";
import { stageIncomingShare } from "../lib/incoming-share-draft";
import { useMobileTokens } from "../lib/native";
import { filterPickedAttachments } from "../lib/pick-attachments-filter";
import { errorText } from "../lib/user-error";

export default function ShareIn() {
  const router = useRouter();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [data, setData] = useState<{
    me: MobileMe;
    bots: MobileBot[];
    groups: MobileGroup[];
    payloads: SharePayload[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const ownsScope = useRef<() => boolean>(() => false);
  useEffect(() => {
    let active = true;
    const current = captureMobileScreenScope();
    ownsScope.current = current;
    setError(null);
    setLoading(true);
    setData(null);
    void (async () => {
      if (!(await loadSessionToken())) {
        if (active && current()) {
          clearSharedPayloads();
          setSignedOut(true);
        }
        return;
      }
      const payloads = getSharedPayloads();
      const [me, bots, groups] = await Promise.all([
        rpc<MobileMe>("me"),
        rpc<MobileBot[]>("bots/list"),
        rpc<MobileGroup[]>("groups/list"),
      ]);
      if (active && current()) setData({ me, bots, groups, payloads });
    })()
      .catch((cause) => {
        if (active && current()) setError(errorText(cause, t("Could not import shared content")));
      })
      .finally(() => {
        if (active && current()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function choose(
    target: { botId: string; name: string } | { groupId: string; name: string },
  ) {
    if (!data || pending.current || !ownsScope.current()) return;
    const current = captureMobileScreenScope();
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const shared = parseIncomingShare(
        data.payloads,
        Object.values(Paths.appleSharedContainers).map((directory) => directory.uri),
      );
      const candidates = [];
      for (const item of shared.files) {
        const file = new File(item.uri);
        const size = file.info().size;
        if (typeof size !== "number" || size < 0 || size > ATTACHMENT_MAX_BYTES)
          throw new Error(t("Shared file is unavailable or too large"));
        const mimeType = inferAttachmentMimeType(item.name, item.mimeType);
        if (!mimeType) throw new Error(t("This shared file type is not supported"));
        candidates.push({ name: item.name, mimeType, size, contentBase64: await file.base64() });
      }
      const picked = filterPickedAttachments(0, candidates);
      if (picked.skipped.length) throw new Error(t("Some shared files could not be imported"));
      if (!current() || !ownsScope.current()) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      stageIncomingShare(id, {
        scope: {
          endpoint: currentApiBase(),
          userId: data.me.userId,
          spaceId: data.me.spaceId,
          conversation: "groupId" in target ? `group:${target.groupId}` : `bot:${target.botId}`,
        },
        text: shared.text,
        attachments: picked.attachments.map((item, index) => ({ ...item, id: `${id}-${index}` })),
      });
      // A newer share arriving during file reads must remain available for its own review.
      if (JSON.stringify(getSharedPayloads()) === JSON.stringify(data.payloads))
        clearSharedPayloads();
      router.replace({
        pathname: "groupId" in target ? "/group-thread" : "/thread",
        params: { ...target, shareId: id },
      });
    } catch (cause) {
      if (current()) setError(errorText(cause, t("Could not import shared content")));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 24, gap: 16 }}
      style={{ flex: 1, backgroundColor: tokens.background }}
    >
      <Stack.Screen options={{ title: t("Share to Kith") }} />
      {loading ? <ActivityIndicator /> : null}
      {signedOut ? (
        <>
          <Text style={{ color: tokens.foreground }}>
            {t("Sign in, then share this content again.")}
          </Text>
          <NativeActionButton
            label={t("Sign in")}
            onPress={() => router.replace({ pathname: "/sign-in", params: { mode: "in" } })}
          />
        </>
      ) : null}
      {error ? (
        <View>
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {error}
          </Text>
          <NativeActionButton
            label={t("Retry")}
            prominence="plain"
            onPress={() => setAttempt((value) => value + 1)}
          />
        </View>
      ) : null}
      {data ? (
        <>
          <Text
            accessibilityRole="header"
            style={{ color: tokens.foreground, fontSize: 22, fontWeight: "600" }}
          >
            {t("Choose a conversation")}
          </Text>
          {data.bots.map((bot) => (
            <NativeActionButton
              key={bot.id}
              label={bot.name}
              disabled={busy}
              prominence="secondary"
              onPress={() => void choose({ botId: bot.id, name: bot.name })}
            />
          ))}
          {data.groups.map((group) => (
            <NativeActionButton
              key={group.id}
              label={group.name}
              disabled={busy}
              prominence="secondary"
              onPress={() => void choose({ groupId: group.id, name: group.name })}
            />
          ))}
          {!data.bots.length && !data.groups.length ? (
            <NativeActionButton
              label={t("Open Kith to prepare your assistant")}
              onPress={() => router.replace("/")}
            />
          ) : null}
        </>
      ) : null}
      <NativeActionButton
        label={t("Cancel")}
        prominence="plain"
        onPress={() => {
          clearSharedPayloads();
          router.replace("/");
        }}
      />
    </ScrollView>
  );
}
