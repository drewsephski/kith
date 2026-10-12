import type { MenuComponentRef } from "@expo/ui/community/menu";
import { MenuView } from "@expo/ui/community/menu";
import { useRef } from "react";
import { useWindowDimensions, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useResolvedAppearance } from "../lib/native";
import type { InboxChatMenuProps } from "./inbox-chat-menu.shared";
import { inboxChatActions } from "./inbox-chat-menu.shared";

export function InboxChatMenu(props: InboxChatMenuProps) {
  useI18n();
  const scheme = useResolvedAppearance();
  const menu = useRef<MenuComponentRef>(null);
  const { width } = useWindowDimensions();
  if (!props.enabled) return <View style={props.style}>{props.children()}</View>;
  return (
    <MenuView
      title={props.chat.name}
      ref={menu}
      shouldOpenOnLongPress
      colorScheme={scheme}
      actions={inboxChatActions(props)}
      style={props.style}
      onPressAction={({ nativeEvent }) => props.onAction(nativeEvent.event)}
    >
      <View style={{ width: props.compact ? (width - 20) / 3 : width }}>
        {props.children(() => menu.current?.show())}
      </View>
    </MenuView>
  );
}
