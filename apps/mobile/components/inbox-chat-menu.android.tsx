import type { MenuAction } from "@expo/ui/community/menu";
import { DropdownMenu, DropdownMenuItem, Host, Spacer, Text } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import type { InboxChatMenuProps } from "./inbox-chat-menu.shared";
import { inboxChatActions } from "./inbox-chat-menu.shared";

export function InboxChatMenu(props: InboxChatMenuProps) {
  useI18n();
  const scheme = useResolvedAppearance();
  const [open, setOpen] = useState(false);
  // Open after release so the popup cannot consume the hold's final touch.
  const requested = useRef(false);
  const choose = (id: string) => {
    setOpen(false);
    props.onAction(id);
  };
  return (
    <View
      style={props.style}
      onTouchEnd={() => {
        if (requested.current && props.enabled) setOpen(true);
        requested.current = false;
      }}
      onTouchCancel={() => {
        requested.current = false;
      }}
    >
      {props.children(
        props.enabled
          ? () => {
              requested.current = true;
            }
          : undefined,
      )}
      <Host
        pointerEvents="box-none"
        colorScheme={scheme}
        style={{ position: "absolute", right: 16, top: 20, width: 1, height: 1 }}
      >
        <DropdownMenu expanded={open && props.enabled} onDismissRequest={() => setOpen(false)}>
          <DropdownMenu.Trigger>
            <Spacer modifiers={[size(1, 1)]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {inboxChatActions(props).map((action) => (
              <ChatMenuItem key={action.id} action={action} choose={choose} />
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}

function ChatMenuItem({ action, choose }: { action: MenuAction; choose: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const colors = useMobileTokens();
  if (action.attributes?.hidden) return null;
  const item = (
    <DropdownMenuItem
      enabled={!action.attributes?.disabled}
      elementColors={action.attributes?.destructive ? { textColor: colors.destructive } : undefined}
      onClick={() =>
        action.subactions?.length ? setOpen(true) : choose(action.id ?? action.title)
      }
    >
      <DropdownMenuItem.Text>
        <Text>{action.title}</Text>
      </DropdownMenuItem.Text>
      {action.state === "on" ? (
        <DropdownMenuItem.TrailingIcon>
          <Text>✓</Text>
        </DropdownMenuItem.TrailingIcon>
      ) : null}
    </DropdownMenuItem>
  );
  if (!action.subactions?.length) return item;
  return (
    <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
      <DropdownMenu.Trigger>{item}</DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {action.subactions.map((child) => (
          <ChatMenuItem
            key={child.id}
            action={child}
            choose={(id) => {
              setOpen(false);
              choose(id);
            }}
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
