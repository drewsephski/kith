import type { TaskStarterReceipt, TaskStarterResult, TaskTodo } from "@rakazo/contracts";
import { TaskTodoSchema } from "@rakazo/contracts";
import { useState } from "react";
import { Linking, View } from "react-native";
import { t } from "../../lib/i18n";
import { errorText } from "../../lib/user-error";
import { NativeActionButton } from "../native-action-button";
import { TaskField, TaskPicker, TaskText, TaskToggle } from "./controls";
import { TaskDateField } from "./date-field";

type TodoEdit = Pick<TaskTodo, "id" | "title" | "notes" | "dueDate" | "priority">;
export function TaskTodoReview({
  result,
  status,
  busy,
  readOnly,
  onError,
  onSave,
}: {
  result: Extract<TaskStarterResult, { kind: "inbox_todos" }>;
  status: TaskStarterReceipt["status"];
  busy: boolean;
  readOnly: boolean;
  onError: (error: string) => void;
  onSave: (ids: string[], edits: TodoEdit[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, TodoEdit>>({});
  function edit(action: TaskTodo, patch: Partial<TodoEdit>) {
    setEdits((previous) => ({
      ...previous,
      [action.id]: {
        ...(previous[action.id] ?? {
          id: action.id,
          title: action.title,
          notes: action.notes,
          dueDate: action.dueDate,
          priority: action.priority,
        }),
        ...patch,
      },
    }));
  }
  const invalidEdits = selected.some((id) => {
    const original = result.actions.find((row) => row.id === id);
    const edited = edits[id];
    return !original || (edited && !TaskTodoSchema.safeParse({ ...original, ...edited }).success);
  });
  async function save() {
    const unsaved = selected.filter((id) =>
      result.actions.some((row) => row.id === id && !row.savedItemId),
    );
    if (!unsaved.length) return;
    if (
      await onSave(
        unsaved,
        unsaved.flatMap((id) => (edits[id] ? [edits[id]] : [])),
      )
    ) {
      setSelected([]);
      setEdits({});
      setEditing(null);
    }
  }
  return (
    <>
      {result.actions.map((original) => {
        const action = { ...original, ...edits[original.id] };
        return (
          <View key={action.id} style={{ gap: 8 }}>
            <TaskToggle
              label={action.title}
              value={selected.includes(action.id)}
              disabled={readOnly || busy || Boolean(action.savedItemId)}
              onChange={(value) =>
                setSelected((previous) =>
                  value ? [...previous, action.id] : previous.filter((id) => id !== action.id),
                )
              }
            />
            <TaskText>
              {action.savedItemId
                ? t("Saved")
                : `${{ high: t("High"), normal: t("Normal"), low: t("Low") }[action.priority]}${action.dueDate ? ` · ${action.dueDate}` : ""} · ${action.reason}`}
            </TaskText>
            {action.sourceIds.map((id) => {
              const source = result.sources.find((row) => row.id === id);
              return source?.url ? (
                <NativeActionButton
                  key={id}
                  label={source.title}
                  prominence="plain"
                  fill={false}
                  onPress={() =>
                    void Linking.openURL(source.url!).catch((reason) =>
                      onError(errorText(reason, t("Could not open source"))),
                    )
                  }
                />
              ) : null;
            })}
            {!readOnly && !action.savedItemId ? (
              <NativeActionButton
                label={editing === action.id ? t("Done editing") : t("Edit")}
                prominence="plain"
                fill={false}
                disabled={busy}
                onPress={() => setEditing(editing === action.id ? null : action.id)}
              />
            ) : null}
            {editing === action.id ? (
              <>
                <TaskField
                  disabled={busy}
                  label={t("Title")}
                  value={action.title}
                  onChange={(title) => edit(original, { title })}
                />
                <TaskField
                  disabled={busy}
                  label={t("Notes")}
                  value={action.notes}
                  onChange={(notes) => edit(original, { notes })}
                />
                <TaskDateField
                  disabled={busy}
                  value={action.dueDate}
                  onChange={(dueDate) => edit(original, { dueDate })}
                />
                <TaskPicker
                  label={t("Priority")}
                  value={action.priority}
                  choices={[
                    { id: "high", label: t("High") },
                    { id: "normal", label: t("Normal") },
                    { id: "low", label: t("Low") },
                  ]}
                  onChange={(id) => edit(original, { priority: id as TaskTodo["priority"] })}
                />
              </>
            ) : null}
          </View>
        );
      })}
      {!readOnly ? (
        <NativeActionButton
          label={t("Save selected to-dos")}
          disabled={!selected.length || invalidEdits || status !== "completed"}
          busy={busy}
          onPress={() => void save()}
        />
      ) : null}
    </>
  );
}
