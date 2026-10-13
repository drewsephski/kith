import type { MenuAction } from "@expo/ui/community/menu";
import { Button, ContextMenu, Host, Menu, RNHostView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  contentShape,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { botColors } from "@rakazo/ui-tokens";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { native, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { BotAvatar } from "./bot-avatar";
import type { InboxChatMenuProps } from "./inbox-chat-menu.shared";
import { inboxChatActions } from "./inbox-chat-menu.shared";
import { NativeSymbol } from "./native-symbol";

export function InboxChatMenu(props: InboxChatMenuProps) {
  const { t } = useI18n();
  const scheme = useResolvedAppearance();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  if (!props.enabled) return <View style={props.style}>{props.children()}</View>;
  const triggerWidth = props.compact ? (width - 20) / 3 : width;
  const previewWidth = Math.min(width - 48, 360);
  const trigger = (
    <RNHostView matchContents>
      <View pointerEvents={props.compact ? "none" : "auto"} style={{ width: triggerWidth }}>
        {props.children()}
      </View>
    </RNHostView>
  );
  const openLabel = [
    props.chat.name,
    props.chat.pinned ? t("Pinned") : null,
    props.chat.unread ? t("unread") : null,
  ]
    .filter(Boolean)
    .join(", ");

  function action(entry: MenuAction) {
    if (entry.subactions)
      return (
        <Menu
          key={entry.id}
          label={entry.title}
          systemImage={typeof entry.image === "string" ? entry.image : undefined}
        >
          {entry.subactions.map(action)}
        </Menu>
      );
    return (
      <Button
        key={entry.id}
        label={entry.title}
        systemImage={
          entry.state === "on"
            ? "checkmark"
            : typeof entry.image === "string"
              ? entry.image
              : undefined
        }
        role={entry.attributes?.destructive ? "destructive" : undefined}
        onPress={() => {
          if (entry.id) props.onAction(entry.id);
        }}
      />
    );
  }
  return (
    <Host matchContents ignoreSafeArea="all" colorScheme={scheme} style={props.style}>
      <ContextMenu>
        <ContextMenu.Trigger>
          {props.compact ? (
            <Button
              onPress={props.onOpen}
              modifiers={[
                buttonStyle("plain"),
                frame({ width: triggerWidth }),
                contentShape(shapes.rectangle()),
                accessibilityLabel(openLabel),
              ]}
            >
              {trigger}
            </Button>
          ) : (
            trigger
          )}
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <RNHostView matchContents>
            <View style={[styles.preview, { width: previewWidth }]}>
              <View style={styles.heading}>
                {props.chat.color !== undefined ? (
                  <BotAvatar
                    size={28}
                    color={props.chat.color || botColors[3]}
                    identity={props.chat.id}
                  />
                ) : (
                  <NativeSymbol ios="person.2" android="people-outline" size={24} />
                )}
                <Text style={styles.title}>{props.chat.name}</Text>
              </View>
              {props.chat.preview ? (
                <ScrollView style={styles.message}>
                  <Text style={styles.body}>{props.chat.preview}</Text>
                </ScrollView>
              ) : null}
            </View>
          </RNHostView>
        </ContextMenu.Preview>
        <ContextMenu.Items>{inboxChatActions(props).map(action)}</ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

function createStyles() {
  return StyleSheet.create({
    preview: { backgroundColor: native.page, padding: 16, gap: 14, borderRadius: 20 },
    heading: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { flex: 1, color: native.label, fontSize: 17, fontWeight: "600" },
    message: { maxHeight: 240, backgroundColor: native.fill, padding: 14, borderRadius: 18 },
    body: { color: native.label, fontSize: 17, lineHeight: 24, paddingBottom: 14 },
  });
}
