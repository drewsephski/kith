import type { CalendarReceipt as Receipt } from "@rakazo/contracts";
import { Alert } from "react-native";
import { rpc } from "../lib/api";
import { NativeActionButton } from "./native-action-button";

export function CalendarReceipt({ receiptId }: { receiptId: string }) {
  async function inspect() {
    try {
      const receipt = await rpc<Receipt>("calendar/receipt", { receiptId });
      Alert.alert(
        "Briefing receipt",
        [
          receipt.status,
          `Created: ${receipt.createdAt}`,
          `Started: ${receipt.startedAt ?? "—"}`,
          `Finished: ${receipt.completedAt ?? "—"}`,
          `Attempts: ${receipt.attempts}`,
          receipt.timezone,
          `${receipt.snapshot?.events.length ?? 0} events retrieved`,
          receipt.error,
        ]
          .filter(Boolean)
          .join("\n"),
        [
          { text: "Close", style: "cancel" },
          {
            text: "Details",
            onPress: () =>
              Alert.alert("Briefing details", receipt.outcome ?? "No outcome saved", [
                { text: "Close", style: "cancel" },
                {
                  text: "Sources",
                  onPress: () =>
                    Alert.alert(
                      "Verified calendar data",
                      JSON.stringify(receipt.snapshot, null, 2),
                    ),
                },
              ]),
          },
          ...(receipt.status === "failed"
            ? [
                {
                  text: "Retry",
                  onPress: () => {
                    void rpc("calendar/retry", { receiptId })
                      .then(inspect)
                      .catch(() =>
                        Alert.alert("Could not retry", "Check your Calendar connection."),
                      );
                  },
                },
              ]
            : []),
        ],
      );
    } catch {
      Alert.alert("Could not load receipt", "Try again.");
    }
  }
  return (
    <NativeActionButton
      label="Calendar briefing · View receipt"
      fill={false}
      prominence="secondary"
      onPress={() => void inspect()}
    />
  );
}
