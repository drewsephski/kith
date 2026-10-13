import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import type { MobileMe } from "./api";
import { captureMobileScreenScope, mobileScreenScopeKey, rpc } from "./api";
import { cancelFocusPrompt, focusPromptThreadActive } from "./focus-prompt";
import { saveLastBotId } from "./last-bot";
import { setOpenNotificationThread } from "./live-notifications";

/** Navigation focus owns metadata refresh; refreshed roster/speech objects do not refocus a screen. */
export function useThreadFocus(options: {
  botId?: string;
  readOnly: boolean;
  notificationThreadId?: string;
  refreshBots: () => Promise<void>;
  markRead: () => void;
  speakReply: () => void;
  onNeedsModel: (value: boolean) => void;
}) {
  const { botId, readOnly, notificationThreadId } = options;
  const actions = useRef(options);
  actions.current = options;
  const scopeKey = mobileScreenScopeKey();
  useFocusEffect(
    useCallback(() => {
      if (botId && !readOnly) {
        focusPromptThreadActive(botId);
        void saveLastBotId(botId).catch(() => undefined);
      } else {
        cancelFocusPrompt();
      }
      if (AppState.currentState === "active" && notificationThreadId) {
        void setOpenNotificationThread({ botId, threadId: notificationThreadId }).catch(
          () => undefined,
        );
      }
      let active = true;
      const scopeCurrent = captureMobileScreenScope();
      void rpc<MobileMe>("me")
        .then((me) => {
          if (active && scopeCurrent()) actions.current.onNeedsModel(me.needsModel);
        })
        .catch(() => undefined);
      void actions.current.refreshBots();
      actions.current.markRead();
      if (!readOnly) actions.current.speakReply();
      return () => {
        active = false;
        void setOpenNotificationThread(null).catch(() => undefined);
      };
    }, [botId, readOnly, notificationThreadId, scopeKey]),
  );
}
