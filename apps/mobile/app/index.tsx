import { MenuView } from "@expo/ui/community/menu";
import type { SearchHit, SpaceBot, SpaceGroup } from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES } from "@rakazo/core";
import { botColors } from "@rakazo/ui-tokens";
import { Redirect, useFocusEffect, useNavigation, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { BotOrganizeModal } from "../components/bot-organize-modal";
import { GroupAvatar } from "../components/group-avatar";
import { InboxChatMenu } from "../components/inbox-chat-menu";
import { FlatList } from "../components/minimal-scroll";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import type {
  MobileBot,
  MobileBotSection,
  MobileGroup,
  MobileMe,
  MobileSpace,
  MobileSpaceNavigation,
} from "../lib/api";
import {
  currentApiBase,
  loadSessionToken,
  mobileScreenScopeKey,
  rpc,
  selectedSpaceId,
  selectInitialSpace,
  selectSpace,
} from "../lib/api";
import { mobileTokens, resolveMobileAppearance } from "../lib/appearance";
import { confirmDeleteBot } from "../lib/bot-lifecycle";
import { t, useI18n } from "../lib/i18n";
import { filterBots, formatThreadTime, userInitials } from "../lib/inbox";
import type { InboxSpace, InboxSpaceItem } from "../lib/inbox-spaces";
import {
  canDeleteInboxSpace,
  inboxNeedsCreateHint,
  removeInboxSpace,
  retryInboxSpaceFallback,
  selectInboxSpace,
  spaceInboxItems,
} from "../lib/inbox-spaces";
import { loadIntroProgress } from "../lib/intro";
import { dismissThreadNotifications, resumeLiveNotifications } from "../lib/live-notifications";
import { native, useThemedStyles } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { useScreenInteractive } from "../lib/observe";
import { previewSnippet } from "../lib/preview";
import { registerPushToken } from "../lib/push";
import { querySpaceSearch } from "../lib/search";
import { mobileSearchDestination } from "../lib/search-destination";
import { dedupeSearchHits, searchHitListKey, searchHitRowPreview } from "../lib/search-list";
import { currentSessionGeneration } from "../lib/session";
import { errorText } from "../lib/user-error";

const FALLBACK_COLOR = botColors[3];

type InboxItem = InboxSpaceItem | { type: "search"; hit: SearchHit };

async function openMobileSpace(spaceId: string | undefined, open: () => void) {
  if (spaceId && !(await selectSpace(spaceId))) {
    Alert.alert(t("Could not switch spaces"), t("Try again."));
    return;
  }
  open();
}

export default function Home() {
  const tokens = mobileTokens();
  const appearance = resolveMobileAppearance();
  const styles = useThemedStyles(createHomeStyles);
  const { t, locale } = useI18n();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [groups, setGroups] = useState<MobileGroup[]>([]);
  const [botSections, setBotSections] = useState<MobileBotSection[]>([]);
  const [spaces, setSpaces] = useState<MobileSpace[]>([]);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  useScreenInteractive(ready && hasSession && (me !== null || error !== null));
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [organizeTarget, setOrganizeTarget] = useState<{
    kind: "bot" | "group";
    id: string;
    mode: "create" | "rename";
    scope: string;
  } | null>(null);
  const inboxRequestId = useRef(0);
  const openedInitialAssistant = useRef<string | null>(null);
  const preparingInitialAssistant = useRef<string | null>(null);
  const [preparingAssistant, setPreparingAssistant] = useState(false);
  const spaceActionRef = useRef<{ busy: boolean; recoveryId: string | null }>({
    busy: false,
    recoveryId: null,
  });
  const [spaceBusy, setSpaceBusy] = useState(false);
  const [spaceRecoveryId, setSpaceRecoveryId] = useState<string | null>(null);
  const [collapsedRosterParents, setCollapsedRosterParents] = useState(() => new Set<string>());
  const toggleRosterParent = useCallback((botId: string) => {
    setCollapsedRosterParents((previous) => {
      const next = new Set(previous);
      if (next.has(botId)) next.delete(botId);
      else next.add(botId);
      return next;
    });
  }, []);

  const loadBots = useCallback(async () => {
    if (spaceActionRef.current.busy || spaceActionRef.current.recoveryId) return;
    const requestId = ++inboxRequestId.current;
    const session = currentSessionGeneration();
    const endpoint = currentApiBase();
    const selection = selectedSpaceId();
    const current = () =>
      requestId === inboxRequestId.current &&
      session === currentSessionGeneration() &&
      endpoint === currentApiBase() &&
      (selection === selectedSpaceId() || (!selection && selectedSpaceId() === defaultSpace));
    let defaultSpace: string | null = null;
    setError(null);
    try {
      const [navigation, nextMe, assistant] = await Promise.all([
        rpc<MobileSpaceNavigation>("spaces/list"),
        rpc<MobileMe>("me"),
        rpc<{ botId: string | null }>("assistant/get"),
      ]);
      defaultSpace = nextMe.spaceId;
      if (!current()) return;
      if (!(await selectInitialSpace(nextMe.spaceId))) {
        throw new Error(t("Could not save the default space"));
      }
      if (!current()) return;
      setBots(navigation.current.bots);
      setBotSections(navigation.current.botSections);
      setGroups(navigation.current.groups);
      setSpaces(navigation.spaces);
      setMe(nextMe);
      setAssistantId(assistant.botId);
      const assistantScope = `${endpoint}:${session}:${nextMe.spaceId}`;
      if (
        openedInitialAssistant.current !== assistantScope &&
        (preparingInitialAssistant.current === assistantScope ||
          (!navigation.current.bots.length && !navigation.current.groups.length))
      ) {
        preparingInitialAssistant.current = assistantScope;
        setPreparingAssistant(true);
        const assistant = await rpc<{ botId: string; needsModel: boolean }>("assistant/ensure");
        if (!current()) return;
        // Both onboarding operations are server-idempotent. A lost response can be retried.
        await rpc("onboarding/start", { botId: assistant.botId });
        await rpc("onboarding/promptFocus", { botId: assistant.botId });
        if (!current()) return;
        setAssistantId(assistant.botId);
        openedInitialAssistant.current = assistantScope;
        preparingInitialAssistant.current = null;
        const refreshed = await rpc<MobileSpaceNavigation>("spaces/list");
        if (!current()) return;
        setBots(refreshed.current.bots);
        setBotSections(refreshed.current.botSections);
        setGroups(refreshed.current.groups);
        setSpaces(refreshed.spaces);
      }
    } catch (err) {
      if (!current()) return;
      setError(errorText(err, t("Could not load bots")));
    } finally {
      if (current()) setPreparingAssistant(false);
    }
  }, []);

  const refreshBots = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBots();
    } finally {
      setRefreshing(false);
    }
  }, [loadBots]);

  useEffect(() => {
    void loadSessionToken().then((token) => {
      setHasSession(Boolean(token));
      if (token) setReady(true);
      else
        void loadIntroProgress()
          .then((progress) => setIntroComplete(progress.complete))
          .catch(() => setError(t("Could not restore the introduction")))
          .finally(() => setReady(true));
    });
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    void registerPushToken().catch(() => undefined);
  }, [hasSession]);

  useFocusEffect(
    useCallback(() => {
      if (!hasSession) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        if (AppState.currentState === "active") await loadBots();
        if (!cancelled) timer = setTimeout(() => void tick(), 5_000);
      };
      void tick();
      return () => {
        cancelled = true;
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [hasSession, loadBots]),
  );

  const searchScope = mobileScreenScopeKey();
  useEffect(() => {
    const trimmed = query.trim();
    if (!searching || !trimmed) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    const abort = new AbortController();
    const session = currentSessionGeneration();
    const endpoint = currentApiBase();
    const space = selectedSpaceId();
    const current = () =>
      !abort.signal.aborted &&
      session === currentSessionGeneration() &&
      endpoint === currentApiBase() &&
      space === selectedSpaceId();
    setSearchHits([]);
    setSearchError(null);
    setSearchLoading(true);
    const timer = setTimeout(() => {
      setSearchLoading(true);
      void querySpaceSearch(trimmed)
        .then((hits) => {
          if (current()) setSearchHits(hits);
        })
        .catch((cause) => {
          if (current()) setSearchError(errorText(cause, t("Could not search conversations")));
        })
        .finally(() => {
          if (current()) setSearchLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [query, searching, searchRetry, searchScope]);

  const visible = useMemo(() => filterBots(bots, query), [bots, query]);
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) =>
      `${group.name} ${group.preview}`.toLowerCase().includes(needle),
    );
  }, [groups, query]);
  const listData = useMemo((): InboxItem[] => {
    if (query.trim() && searching) {
      return dedupeSearchHits(searchHits).map((hit) => ({ type: "search" as const, hit }));
    }
    const sidebarSpaces =
      spaces.length > 0
        ? spaces.map((space) =>
            space.id === me?.spaceId
              ? { ...space, bots: visible, groups: visibleGroups, botSections }
              : {
                  ...space,
                  bots: filterBots(space.bots, query),
                  groups: space.groups.filter((group) =>
                    `${group.name} ${group.preview}`
                      .toLowerCase()
                      .includes(query.trim().toLowerCase()),
                  ),
                },
          )
        : me
          ? [
              {
                id: me.spaceId,
                name: t("Personal"),
                isDefault: true,
                hasContent: true,
                bots: visible,
                groups: visibleGroups,
                botSections,
              },
            ]
          : [];
    return spaceInboxItems(sidebarSpaces, collapsedRosterParents, assistantId);
  }, [
    assistantId,
    botSections,
    collapsedRosterParents,
    locale,
    me,
    spaces,
    query,
    searching,
    searchHits,
    visible,
    visibleGroups,
  ]);
  const initials = userInitials(me?.name ?? "");
  const organizeChat =
    organizeTarget && organizeTarget.scope === mobileScreenScopeKey()
      ? organizeTarget.kind === "bot"
        ? bots.find((bot) => bot.id === organizeTarget.id)
        : groups.find((group) => group.id === organizeTarget.id)
      : null;
  const insets = useSafeAreaInsets();
  // Keep creation and search in the native navigation bar.
  const nativeHeader = iosAtLeast(26);
  const navigation = useNavigation();
  const router = useRouter();

  function chatLabel(chat: MobileBot | SpaceBot | MobileGroup | SpaceGroup) {
    const sections =
      chat.spaceId === me?.spaceId
        ? botSections
        : spaces.find((space) => space.id === chat.spaceId)?.botSections;
    return sections?.find((section) => section.id === chat.sectionId)?.name;
  }

  function openChat(kind: "bot" | "group", chat: { id: string; name: string; spaceId?: string }) {
    if (spaceActionRef.current.busy || spaceActionRef.current.recoveryId) return;
    void openMobileSpace(chat.spaceId, () =>
      kind === "bot"
        ? router.push({ pathname: "/thread", params: { botId: chat.id, name: chat.name } })
        : router.push({ pathname: "/group-thread", params: { groupId: chat.id, name: chat.name } }),
    );
  }

  function handleChatAction(
    kind: "bot" | "group",
    chat: MobileBot | SpaceBot | MobileGroup | SpaceGroup,
    action: string,
  ) {
    if (
      chat.spaceId !== me?.spaceId ||
      spaceActionRef.current.busy ||
      spaceActionRef.current.recoveryId
    )
      return;
    const scope = mobileScreenScopeKey();
    const current = () => scope === mobileScreenScopeKey() && selectedSpaceId() === chat.spaceId;
    const target = { [`${kind}Id`]: chat.id };
    const perform = async (path: string, input: Record<string, unknown> = target) => {
      if (!current()) return false;
      try {
        await rpc(path, input);
        if (current()) await refreshBots();
        return current();
      } catch (cause) {
        if (current()) Alert.alert(t("Could not update chat"), errorText(cause, t("Try again.")));
        return false;
      }
    };
    if (action === "read") void perform(chat.unread ? "threads/markRead" : "threads/markUnread");
    else if (action === "pin") void perform(`${kind}s/update`, { ...target, pinned: !chat.pinned });
    else if (action === "settings") {
      router.push(
        kind === "bot"
          ? { pathname: "/bot-settings", params: { botId: chat.id } }
          : { pathname: "/group-settings", params: { groupId: chat.id } },
      );
    } else if (action === "notifications" && "notifyOnFinish" in chat) {
      void (async () => {
        if (!(await perform("bots/update", { ...target, notifyOnFinish: !chat.notifyOnFinish })))
          return;
        const token = await loadSessionToken();
        if (!current()) return;
        await resumeLiveNotifications(currentApiBase(), token, chat.spaceId ?? "").catch(
          () => undefined,
        );
        if (current() && chat.notifyOnFinish && "threadId" in chat)
          await dismissThreadNotifications({ threadId: chat.threadId }).catch(() => undefined);
      })();
    } else if (action.startsWith("label:")) {
      void perform(`${kind}s/update`, { ...target, sectionId: action.slice(6) || null });
    } else if (action === "new-label" || action === "rename-label") {
      if (Platform.OS === "ios") {
        const section = botSections.find((item) => item.id === chat.sectionId);
        const rename = action === "rename-label" && section;
        Alert.prompt(
          rename ? t("Rename label") : t("New label"),
          undefined,
          [
            { text: t("Cancel"), style: "cancel" },
            {
              text: rename ? t("Save") : t("Create"),
              onPress: (name: string | undefined) => {
                if (!name?.trim()) return;
                void perform(
                  rename ? "botSections/update" : "botSections/create",
                  rename
                    ? { sectionId: section.id, name: name.trim() }
                    : { ...target, name: name.trim() },
                );
              },
            },
          ],
          "plain-text",
          rename ? section.name : "",
        );
        return;
      }
      setOrganizeTarget({
        kind,
        id: chat.id,
        mode: action === "new-label" ? "create" : "rename",
        scope,
      });
    } else if (action === "hide") void perform(`${kind}s/archive`);
    else if (action === "delete") {
      if (kind === "bot")
        confirmDeleteBot(
          chat,
          () => {
            if (current()) void refreshBots();
          },
          current,
        );
      else
        Alert.alert(chat.name, t("Delete this group? Bots and their solo threads are kept."), [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Delete"), style: "destructive", onPress: () => void perform("groups/remove") },
        ]);
    }
  }

  async function chooseInboxSpace(spaceId: string) {
    if (spaceActionRef.current.busy) return;
    spaceActionRef.current.busy = true;
    setSpaceBusy(true);
    inboxRequestId.current += 1;
    try {
      const refresh = async () => {
        spaceActionRef.current.recoveryId = null;
        setSpaceRecoveryId(null);
        spaceActionRef.current.busy = false;
        await refreshBots();
      };
      const selected =
        spaceActionRef.current.recoveryId === spaceId
          ? await retryInboxSpaceFallback(spaceId, refresh)
          : await selectInboxSpace(spaceId, refresh);
      if (!selected) throw new Error(t("Could not switch spaces"));
    } catch (err) {
      const message = errorText(err, t("Could not switch spaces"));
      setError(message);
      Alert.alert(message, t("Try again."));
    } finally {
      spaceActionRef.current.busy = false;
      setSpaceBusy(false);
    }
  }

  async function deleteInboxSpace(space: InboxSpace) {
    if (
      !canDeleteInboxSpace(space) ||
      spaceActionRef.current.busy ||
      spaceActionRef.current.recoveryId
    )
      return;
    spaceActionRef.current.busy = true;
    setSpaceBusy(true);
    inboxRequestId.current += 1;
    try {
      const recoveryId = await removeInboxSpace(space.id, async () => {
        spaceActionRef.current.busy = false;
        await refreshBots();
      });
      if (recoveryId) {
        spaceActionRef.current.recoveryId = recoveryId;
        setSpaceRecoveryId(recoveryId);
        setError(t("Could not switch spaces"));
      }
    } catch (err) {
      Alert.alert(t("Could not delete space"), errorText(err, t("Try again.")));
    } finally {
      spaceActionRef.current.busy = false;
      setSpaceBusy(false);
    }
  }

  function confirmDeleteSpace(space: InboxSpace) {
    if (
      !canDeleteInboxSpace(space) ||
      spaceActionRef.current.busy ||
      spaceActionRef.current.recoveryId
    )
      return;
    Alert.alert(
      t("Delete {name}?", { name: space.name }),
      t("This removes the empty space for everyone."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete"),
          style: "destructive",
          onPress: () => void deleteInboxSpace(space),
        },
      ],
    );
  }

  const runCreateAction = useCallback(
    (action: "bot" | "group" | "space") => {
      if (spaceActionRef.current.busy || spaceActionRef.current.recoveryId) return;
      if (action === "bot") router.push("/new");
      else if (action === "group") router.push("/new-group");
      else router.push("/new-space");
    },
    [router],
  );

  useLayoutEffect(() => {
    if (!nativeHeader) return;
    const signedIn = ready && hasSession;
    navigation.setOptions({
      headerShown: signedIn,
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      title: "",
      unstable_headerLeftItems: () => [
        {
          type: "button" as const,
          label: initials,
          labelStyle: { fontSize: 15, fontWeight: "600" },
          accessibilityLabel: t("Account"),
          onPress: () => router.push("/account"),
        },
      ],
      unstable_headerRightItems: () => [
        {
          type: "button" as const,
          accessibilityLabel: t("For you"),
          icon: { type: "sfSymbol" as const, name: "lightbulb" },
          onPress: () => router.push("/for-you"),
        },
        {
          type: "button" as const,
          accessibilityLabel: t("Artifacts"),
          icon: { type: "sfSymbol" as const, name: "square.stack.3d.up" },
          onPress: () => router.push("/artifacts"),
        },
        {
          type: "menu" as const,
          accessibilityLabel: t("Create"),
          icon: { type: "sfSymbol" as const, name: "plus" },
          menu: {
            items: [
              {
                type: "action" as const,
                label: t("New bot"),
                icon: { type: "sfSymbol" as const, name: "person.crop.circle.badge.plus" },
                onPress: () => runCreateAction("bot"),
              },
              {
                type: "action" as const,
                label: t("New group"),
                icon: { type: "sfSymbol" as const, name: "person.2" },
                onPress: () => runCreateAction("group"),
              },
              {
                type: "action" as const,
                label: t("New space"),
                icon: { type: "sfSymbol" as const, name: "square.grid.2x2" },
                onPress: () => runCreateAction("space"),
              },
            ],
          },
        },
      ],
      headerSearchBarOptions: {
        placement: "integratedButton",
        allowToolbarIntegration: false,
        placeholder: t("Search"),
        hideWhenScrolling: false,
        autoCapitalize: "none",
        onFocus: () => setSearching(true),
        onChangeText: (event: { nativeEvent: { text: string } }) =>
          setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => {
          setSearching(false);
          setQuery("");
        },
      },
    });
  }, [nativeHeader, navigation, ready, hasSession, initials, runCreateAction, router, t, locale]);

  if (!ready) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={native.secondaryLabel} />
      </View>
    );
  }
  if (!hasSession) return <Redirect href={introComplete ? "/sign-in" : "/intro"} />;

  return (
    <View style={styles.screen}>
      {nativeHeader ? null : (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <View style={styles.circleButton}>
            <HeaderButton accessibilityLabel={t("Account")} onPress={() => router.push("/account")}>
              <Text style={styles.profileInitials}>{initials}</Text>
            </HeaderButton>
          </View>
          <View style={styles.headerActions}>
            <HeaderButton
              accessibilityLabel={t("Search")}
              active={searching}
              onPress={() =>
                setSearching((open) => {
                  if (open) setQuery("");
                  return !open;
                })
              }
            >
              <NativeSymbol ios="magnifyingglass" android="search" size={17} />
            </HeaderButton>
            <HeaderButton accessibilityLabel={t("For you")} onPress={() => router.push("/for-you")}>
              <NativeSymbol ios="lightbulb" android="bulb-outline" size={17} />
            </HeaderButton>
            <HeaderButton
              accessibilityLabel={t("Artifacts")}
              onPress={() => router.push("/artifacts")}
            >
              <NativeSymbol ios="square.stack.3d.up" android="layers-outline" size={17} />
            </HeaderButton>
            <MenuView
              actions={[
                { id: "bot", title: t("New bot"), image: "person.crop.circle.badge.plus" },
                { id: "group", title: t("New group"), image: "person.2" },
                { id: "space", title: t("New space"), image: "square.grid.2x2" },
              ]}
              colorScheme={appearance}
              onPressAction={({ nativeEvent }) => {
                const action = nativeEvent.event;
                if (action === "bot" || action === "group" || action === "space") {
                  runCreateAction(action);
                }
              }}
            >
              <View
                accessibilityLabel={t("Create")}
                accessibilityRole="button"
                style={styles.headerButton}
              >
                <NativeSymbol ios="plus" android="add" size={18} />
              </View>
            </MenuView>
          </View>
        </View>
      )}

      <FlatList<InboxItem>
        style={{ flex: 1 }}
        data={listData}
        keyExtractor={(item) => {
          if (item.type === "heading") return `heading-${item.key}`;
          if (item.type === "pins") return `pins-${item.key}`;
          if (item.type === "bot") return item.bot.id;
          if (item.type === "group") return `group-${item.group.id}`;
          return searchHitListKey(item.hit);
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        indicatorStyle={appearance === "dark" ? "white" : "black"}
        contentContainerStyle={[
          styles.list,
          // iOS moves the active search bar to the bottom and removes the navigation inset.
          nativeHeader && searching ? { paddingTop: insets.top + 12 } : undefined,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshBots();
            }}
            tintColor={native.secondaryLabel}
            colors={[tokens.mutedForeground]}
            progressBackgroundColor={tokens.muted}
          />
        }
        ListHeaderComponent={
          <>
            {searching && !nativeHeader ? (
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder={t("Search")}
                placeholderTextColor={tokens.mutedForeground}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                keyboardAppearance={appearance}
                clearButtonMode="while-editing"
                style={styles.searchField}
              />
            ) : null}

            {error ? (
              <View>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
                <NativeActionButton
                  label={t("Retry")}
                  prominence="plain"
                  onPress={() => void refreshBots()}
                />
              </View>
            ) : null}
            {searchError ? (
              <View>
                <Text accessibilityRole="alert" style={styles.error}>
                  {searchError}
                </Text>
                <NativeActionButton
                  label={t("Retry search")}
                  prominence="plain"
                  onPress={() => setSearchRetry((value) => value + 1)}
                />
              </View>
            ) : null}
            {preparingAssistant ? (
              <ActivityIndicator accessibilityLabel={t("Preparing your assistant")} />
            ) : null}
            {spaceRecoveryId ? (
              <Pressable
                accessibilityRole="button"
                disabled={spaceBusy}
                onPress={() => void chooseInboxSpace(spaceRecoveryId)}
                style={styles.recoveryAction}
              >
                <Text style={styles.spaceTitle}>{t("Try again.")}</Text>
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !me && !error && !searching ? (
            <ActivityIndicator accessibilityLabel={t("Loading…")} />
          ) : (
            <Text style={styles.empty}>
              {query.trim() && searching
                ? searchLoading
                  ? t("Searching…")
                  : searchError
                    ? ""
                    : t("No results")
                : query.trim()
                  ? t("No matching bots")
                  : searching
                    ? t("Search conversations, files, and routines")
                    : error || preparingAssistant
                      ? ""
                      : t("Tap + to create a bot")}
            </Text>
          )
        }
        ListFooterComponent={
          inboxNeedsCreateHint(listData) ? (
            <Text style={styles.empty}>{t("Tap + to create a bot")}</Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === "pins" ? (
            <View style={styles.pinnedGrid}>
              {item.chats.map((entry) => {
                const chat = entry.type === "bot" ? entry.bot : entry.group;
                return (
                  <InboxChatMenu
                    key={chat.id}
                    chat={chat}
                    sections={botSections}
                    enabled={chat.spaceId === me?.spaceId}
                    compact
                    style={styles.pinnedCell}
                    onAction={(action) => handleChatAction(entry.type, chat, action)}
                  >
                    {(onLongPress) => (
                      <Pressable
                        onLongPress={onLongPress}
                        accessibilityRole="button"
                        accessibilityLabel={[
                          chat.name,
                          t("Pinned"),
                          chat.unread ? t("unread") : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        onPress={() => openChat(entry.type, chat)}
                        style={({ pressed }) => [styles.pinnedChat, pressed && styles.rowPressed]}
                      >
                        <View>
                          {entry.type === "bot" ? (
                            <BotAvatar
                              color={entry.bot.color || FALLBACK_COLOR}
                              identity={chat.id}
                              status={entry.bot.status}
                              size={84}
                              muted={!entry.bot.notifyOnFinish}
                            />
                          ) : (
                            <GroupAvatar members={entry.group.members} size={84} />
                          )}
                          {chat.unread ? (
                            <View style={[styles.unreadDot, styles.pinnedUnread]} />
                          ) : null}
                        </View>
                        <Text style={styles.pinnedName} numberOfLines={2}>
                          {chat.name}
                        </Text>
                      </Pressable>
                    )}
                  </InboxChatMenu>
                );
              })}
            </View>
          ) : item.type === "search" ? (
            <SearchRow
              hit={item.hit}
              onPress={() => {
                setQuery("");
                setSearchHits([]);
                // A thread that opens while the search keyboard is still up or closing sizes
                // itself against that keyboard and can leave its composer off screen.
                void KeyboardController.dismiss().then(() =>
                  router.push(mobileSearchDestination(item.hit)),
                );
              }}
            />
          ) : item.type === "heading" ? (
            item.space ? (
              <View style={styles.spaceHeading}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{
                    selected: item.space.id === me?.spaceId,
                    disabled: spaceBusy,
                  }}
                  disabled={spaceBusy}
                  onPress={() => {
                    if (item.space) void chooseInboxSpace(item.space.id);
                  }}
                  style={({ pressed }) => [styles.spaceSelect, pressed && styles.rowPressed]}
                >
                  <Text style={styles.spaceTitle}>{item.title}</Text>
                </Pressable>
                {canDeleteInboxSpace(item.space) ? (
                  <MenuView
                    actions={[
                      {
                        id: "delete",
                        title: t("Delete space"),
                        image: "trash",
                        attributes: { destructive: true, disabled: spaceBusy || !!spaceRecoveryId },
                      },
                    ]}
                    colorScheme={appearance}
                    onPressAction={() => {
                      if (item.space) confirmDeleteSpace(item.space);
                    }}
                  >
                    <View
                      accessibilityLabel={t("Space actions for {name}", { name: item.title })}
                      accessibilityRole="button"
                      style={styles.spaceActions}
                    >
                      <NativeSymbol ios="ellipsis" android="ellipsis-horizontal" size={20} />
                    </View>
                  </MenuView>
                ) : null}
              </View>
            ) : (
              <Text style={styles.sectionHeading}>{item.title}</Text>
            )
          ) : (
            <InboxChatMenu
              chat={item.type === "bot" ? item.bot : item.group}
              sections={botSections}
              enabled={
                (item.type === "bot" ? item.bot.spaceId : item.group.spaceId) === me?.spaceId
              }
              onAction={(action) =>
                handleChatAction(item.type, item.type === "bot" ? item.bot : item.group, action)
              }
            >
              {(onLongPress) =>
                item.type === "group" ? (
                  <GroupRow
                    group={item.group}
                    tag={chatLabel(item.group)}
                    onLongPress={onLongPress}
                    onPress={() => openChat("group", item.group)}
                  />
                ) : (
                  <BotRow
                    bot={item.bot}
                    tag={chatLabel(item.bot)}
                    depth={item.depth}
                    hasChildren={item.hasChildren}
                    collapsed={collapsedRosterParents.has(item.bot.id)}
                    onToggleChildren={() => toggleRosterParent(item.bot.id)}
                    onLongPress={onLongPress}
                    onPress={() => openChat("bot", item.bot)}
                  />
                )
              }
            </InboxChatMenu>
          )
        }
      />
      {organizeChat && organizeTarget ? (
        <BotOrganizeModal
          bot={organizeChat}
          labelsOnly
          initialMode={organizeTarget.mode}
          sections={botSections}
          onClose={() => setOrganizeTarget(null)}
          onUpdate={async (update) => {
            if (organizeTarget.scope !== mobileScreenScopeKey()) return;
            await rpc(`${organizeTarget.kind}s/update`, {
              [`${organizeTarget.kind}Id`]: organizeChat.id,
              ...update,
            });
            if (organizeTarget.kind === "bot" && update.notifyOnFinish !== undefined) {
              await resumeLiveNotifications(
                currentApiBase(),
                await loadSessionToken(),
                selectedSpaceId() ?? "",
              ).catch(() => undefined);
              if (!update.notifyOnFinish && "threadId" in organizeChat) {
                await dismissThreadNotifications({ threadId: organizeChat.threadId }).catch(
                  () => undefined,
                );
              }
            }
            await loadBots();
          }}
          onCreateSection={async (name) => {
            if (organizeTarget.scope !== mobileScreenScopeKey()) return;
            await rpc("botSections/create", {
              [`${organizeTarget.kind}Id`]: organizeChat.id,
              name,
            });
            await loadBots();
          }}
          onRenameSection={async (sectionId, name) => {
            if (organizeTarget.scope !== mobileScreenScopeKey()) return;
            await rpc("botSections/update", { sectionId, name });
            await loadBots();
          }}
        />
      ) : null}
    </View>
  );
}

function ConversationRow({
  title,
  preview,
  time,
  avatar,
  tag,
  unread,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleChildren,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  title: string;
  preview: string;
  time: string;
  avatar: ReactNode;
  tag?: string | null;
  unread?: boolean;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleChildren?: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const styles = useThemedStyles(createHomeStyles);
  const { t } = useI18n();
  const toggleLabel = collapsed
    ? t("Expand {name}", { name: title })
    : t("Collapse {name}", { name: title });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // Screen readers treat the row as one element, so the chevron is offered as a row action.
      accessibilityState={hasChildren ? { expanded: !collapsed } : undefined}
      accessibilityActions={
        hasChildren ? [{ name: "toggleChildren", label: toggleLabel }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "toggleChildren") onToggleChildren?.();
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        depth > 0 ? { paddingInlineStart: 16 + depth * 16 } : null,
        pressed && styles.rowPressed,
      ]}
    >
      {hasChildren ? (
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          hitSlop={8}
          onPress={onToggleChildren}
          style={styles.treeToggle}
        >
          <NativeSymbol
            ios={collapsed ? "chevron.right" : "chevron.down"}
            android={collapsed ? "chevron-forward" : "chevron-down"}
            size={14}
          />
        </Pressable>
      ) : null}
      {avatar}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
            {tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagLabel} numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rowMeta}>
            {time ? <Text style={styles.time}>{time}</Text> : null}
          </View>
        </View>
        <View style={styles.previewRow}>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
          {unread ? <View accessibilityElementsHidden style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function HeaderButton({
  children,
  onPress,
  accessibilityLabel,
  active = false,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
}) {
  const styles = useThemedStyles(createHomeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.headerButton,
        (active || pressed) && styles.headerButtonActive,
      ]}
    >
      {children}
    </Pressable>
  );
}

function SearchRow({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const styles = useThemedStyles(createHomeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {hit.title}
          </Text>
          <Text style={styles.time}>{hit.kind}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {searchHitRowPreview(hit)}
        </Text>
      </View>
    </Pressable>
  );
}

function BotRow({
  bot,
  tag,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleChildren,
  onPress,
  onLongPress,
}: {
  bot: MobileBot | SpaceBot;
  tag?: string | null;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleChildren?: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useI18n();
  const preview = previewSnippet(bot.preview, 200) || bot.title || t("No messages yet");
  const time = bot.updatedAt ? formatThreadTime(bot.updatedAt) : "";
  const working = ACTIVE_RUN_STATUSES.some((status) => status === bot.status);
  // Spelled out because an explicit label replaces the one built from the row's children.
  const label = [
    bot.name,
    tag,
    working ? t("Working…") : null,
    bot.notifyOnFinish ? null : t("notifications silenced"),
    bot.unread ? t("unread") : null,
    time,
    preview,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <ConversationRow
      title={bot.name}
      preview={preview}
      time={time}
      tag={tag}
      unread={bot.unread}
      depth={depth}
      hasChildren={hasChildren}
      collapsed={collapsed}
      onToggleChildren={onToggleChildren}
      accessibilityLabel={label}
      accessibilityHint={
        onLongPress ? t("Long press to pin, move, or silence notifications") : undefined
      }
      onPress={onPress}
      onLongPress={onLongPress}
      avatar={
        <BotAvatar
          color={bot.color || FALLBACK_COLOR}
          size={44}
          identity={bot.id}
          status={bot.status}
          muted={!bot.notifyOnFinish}
        />
      }
    />
  );
}

function GroupRow({
  group,
  tag,
  onPress,
  onLongPress,
}: {
  group: MobileGroup | SpaceGroup;
  tag?: string | null;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useI18n();
  const preview =
    previewSnippet(group.preview, 200) || group.members.map((member) => member.name).join(", ");
  const time = group.updatedAt ? formatThreadTime(group.updatedAt) : "";
  return (
    <ConversationRow
      title={group.name}
      tag={tag}
      preview={preview}
      time={time}
      unread={group.unread}
      accessibilityLabel={[group.name, group.unread ? t("unread") : null, time, preview]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint={onLongPress ? t("Long press to pin or move to a section") : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      avatar={<GroupAvatar members={group.members} size={44} />}
    />
  );
}

function createHomeStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: native.page,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    circleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: native.fillPressed,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: native.fill,
      overflow: "hidden",
    },
    headerButtonActive: {
      backgroundColor: native.fill,
    },
    profileInitials: {
      color: native.label,
      fontSize: 15,
      fontWeight: "600",
    },
    searchField: {
      marginHorizontal: 16,
      marginBottom: 8,
      minHeight: 44,
      paddingVertical: 10,
      textAlignVertical: "center",
      borderRadius: 10,
      backgroundColor: native.fill,
      color: native.label,
      paddingHorizontal: 12,
      fontSize: 17,
      writingDirection: "auto",
    },
    error: {
      color: native.secondaryLabel,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    list: {
      flexGrow: 1,
      paddingBottom: 32,
    },
    empty: {
      color: native.secondaryLabel,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    pinnedGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 10,
      paddingTop: 20,
      paddingBottom: 24,
    },
    pinnedCell: { width: "33.333333%" },
    pinnedChat: { alignItems: "center", gap: 10, paddingHorizontal: 6, paddingVertical: 8 },
    pinnedName: {
      color: native.secondaryLabel,
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    },
    pinnedUnread: {
      position: "absolute",
      bottom: 2,
      right: 2,
      borderWidth: 2,
      borderColor: native.page,
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 18,
      gap: 14,
    },
    treeToggle: {
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      marginRight: -4,
    },
    rowPressed: {
      opacity: 0.55,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    titleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    name: {
      flexShrink: 1,
      color: native.label,
      fontSize: 17,
      fontWeight: "600",
      writingDirection: "auto",
    },
    tag: {
      flexShrink: 1,
      borderRadius: 8,
      backgroundColor: native.fill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    tagLabel: {
      color: native.secondaryLabel,
      fontSize: 14,
      fontWeight: "600",
      writingDirection: "auto",
    },
    time: {
      color: native.secondaryLabel,
      fontSize: 14,
    },
    previewRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    preview: {
      flex: 1,
      color: native.secondaryLabel,
      fontSize: 16,
      lineHeight: 22,
      writingDirection: "auto",
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens.foreground,
    },
    spaceHeading: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    spaceSelect: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    spaceTitle: {
      color: native.label,
      fontSize: 14,
      fontWeight: "600",
      writingDirection: "auto",
    },
    spaceActions: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    recoveryAction: {
      minHeight: 44,
      paddingHorizontal: 20,
      justifyContent: "center",
    },
    sectionHeading: {
      color: native.secondaryLabel,
      fontSize: 14,
      fontWeight: "600",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    groupAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: native.fill,
      alignItems: "center",
      justifyContent: "center",
    },
    groupAvatarLabel: {
      color: native.secondaryLabel,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
