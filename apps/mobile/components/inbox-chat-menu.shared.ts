import type { MenuAction } from "@expo/ui/community/menu";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { MobileBotSection } from "../lib/api";
import { t } from "../lib/i18n";

export type InboxChatMenuProps = {
  chat: {
    id: string;
    name: string;
    color?: string;
    preview: string;
    unread: boolean;
    pinned: boolean;
    sectionId: string | null;
    notifyOnFinish?: boolean;
  };
  sections: MobileBotSection[];
  enabled: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  children: (onLongPress?: () => void) => ReactNode;
  onAction: (action: string) => void;
};

export function inboxChatActions({ chat, sections }: InboxChatMenuProps): MenuAction[] {
  return [
    {
      id: "read",
      title: chat.unread ? t("Mark read") : t("Mark unread"),
      image: "checkmark.circle",
    },
    {
      id: "pin",
      title: chat.pinned ? t("Unpin") : t("Pin"),
      image: chat.pinned ? "pin.slash" : "pin",
    },
    {
      id: "label",
      title: t("Label"),
      image: "tag",
      subactions: [
        ...sections.map((section) => ({
          id: `label:${section.id}`,
          title: section.name,
          state: chat.sectionId === section.id ? ("on" as const) : ("off" as const),
        })),
        { id: "label:", title: t("No label"), state: chat.sectionId === null ? "on" : "off" },
        { id: "new-label", title: t("New label"), image: "plus" },
        ...(chat.sectionId
          ? [{ id: "rename-label", title: t("Rename label"), image: "pencil" as const }]
          : []),
      ],
    },
    { id: "hide", title: t("Hide"), image: "eye.slash" },
    {
      id: "more",
      title: t("More"),
      image: "ellipsis",
      subactions: [
        ...(typeof chat.notifyOnFinish === "boolean"
          ? [
              {
                id: "notifications",
                title: chat.notifyOnFinish ? t("Silence notifications") : t("Resume notifications"),
                image: "bell" as const,
              },
            ]
          : []),
        { id: "settings", title: t("Settings"), image: "gearshape" },
      ],
    },
    { id: "delete", title: t("Delete"), image: "trash", attributes: { destructive: true } },
  ];
}
