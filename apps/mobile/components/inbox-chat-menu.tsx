import type { MenuComponentRef } from "@expo/ui/community/menu";
import { MenuView } from "@expo/ui/community/menu";
import { useRef } from "react";
import { View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useResolvedAppearance } from "../lib/native";
import type { InboxChatMenuProps } from "./inbox-chat-menu.shared";
import { inboxChatActions } from "./inbox-chat-menu.shared";

export function InboxChatMenu(props: InboxChatMenuProps) {
  useI18n();
  const scheme = useResolvedAppearance();
  const menu = useRef<MenuComponentRef>(null);
  if (!props.enabled) return <View style={props.style}>{props.children()}</View>;
  return (
    <View style={props.style}>
      {props.children(() => menu.current?.show())}
      <MenuView
        title={props.chat.name}
        ref={menu}
        shouldOpenOnLongPress
        colorScheme={scheme}
        actions={inboxChatActions(props)}
        style={{ position: "absolute", right: 16, top: 20 }}
        onPressAction={({ nativeEvent }) => props.onAction(nativeEvent.event)}
      >
        <View style={{ width: 1, height: 1 }} />
      </MenuView>
    </View>
  );
}
