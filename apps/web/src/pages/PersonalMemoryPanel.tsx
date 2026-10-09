import { Trans, useLingui } from "@lingui/react/macro";
import type { MemoryDocument } from "@rakazo/contracts";
import { plainTextFromMarkdown } from "@rakazo/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Skeleton,
  Textarea,
} from "@rakazo/ui-web";
import { ChevronDown, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isPersonalMemory, memoryCategory, memoryTitle } from "../lib/personal-memory";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

export function PersonalMemoryPanel({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [docs, setDocs] = useState<MemoryDocument[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MemoryDocument | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    setError(null);
    void Promise.all([rpc.memory.list({ scope: "user" }), rpc.memory.list({ botId, scope: "bot" })])
      .then(([shared, personal]) => {
        if (!cancelled) setDocs([...shared, ...personal].filter(isPersonalMemory));
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause, t`Could not load memory`));
      });
    return () => {
      cancelled = true;
    };
  }, [botId, attempt, t]);
  const grouped = useMemo(() => {
    const groups = new Map<string, MemoryDocument[]>();
    for (const doc of docs ?? []) {
      if (!`${doc.path} ${doc.content}`.toLowerCase().includes(query.toLowerCase())) continue;
      const category = memoryCategory(doc.path);
      groups.set(category, [...(groups.get(category) ?? []), doc]);
    }
    return [...groups];
  }, [docs, query]);
  const categoryLabel = (category: string) =>
    ({
      preferences: t`Preferences`,
      people: t`People`,
      projects: t`Projects`,
      goals: t`Goals`,
      context: t`Context`,
    })[category];
  async function save(doc: MemoryDocument) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rpc.memory.update({ documentId: doc.id, content: draft });
      setDocs((current) => current?.map((item) => (item.id === doc.id ? updated : item)) ?? []);
      setOpenId(null);
    } catch (cause) {
      setError(errorText(cause, t`Could not save memory`));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.memory.remove({ documentId: deleting.id });
      setDocs((current) => current?.filter((item) => item.id !== deleting.id) ?? []);
      if (openId === deleting.id) setOpenId(null);
      setDeleting(null);
    } catch (cause) {
      setError(errorText(cause, t`Could not delete memory`));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section data-testid="personal-memory" className="space-y-5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-3 text-muted-foreground"
          size={15}
        />
        <Input
          aria-label={t`Search memory`}
          placeholder={t`Search memory`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9"
        />
      </div>
      {error ? (
        <div role="alert" className="text-sm text-destructive">
          {error}
          {!docs ? (
            <Button variant="ghost" size="sm" onClick={() => setAttempt((a) => a + 1)}>
              <Trans>Retry</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {!docs && !error ? <Skeleton className="h-16" /> : null}
      {docs?.length === 0 ? (
        <p className="py-8 text-sm leading-relaxed text-muted-foreground">
          <Trans>Nothing remembered yet. Tell Kith what you’d like it to remember.</Trans>
        </p>
      ) : docs && !grouped.length ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No matching memories</Trans>
        </p>
      ) : null}
      {grouped.map(([category, entries]) => (
        <section key={category} aria-label={categoryLabel(category)}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {categoryLabel(category)}
          </h3>
          {entries.map((doc) => (
            <div key={doc.id} className="border-b border-border py-2">
              <Button
                variant="ghost"
                disabled={busy}
                aria-expanded={openId === doc.id}
                className="h-auto w-full justify-start px-1 py-2 text-start font-normal"
                onClick={() => {
                  setOpenId(openId === doc.id ? null : doc.id);
                  setDraft(doc.content);
                  setError(null);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {memoryTitle(doc.path)}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {plainTextFromMarkdown(doc.content)}
                  </span>
                </span>
                <ChevronDown size={15} className={openId === doc.id ? "rotate-180" : undefined} />
              </Button>
              {openId === doc.id ? (
                <div className="space-y-3 pb-3">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={t`Edit ${memoryTitle(doc.path)}`}
                    disabled={busy}
                    rows={6}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy || draft === doc.content}
                      onClick={() => void save(doc)}
                    >
                      <Trans>Save</Trans>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setOpenId(null)}
                    >
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      className="ms-auto text-destructive"
                      onClick={() => setDeleting(doc)}
                      aria-label={t`Delete ${memoryTitle(doc.path)}`}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground" title={doc.path}>
                    {new Date(doc.updatedAt).toLocaleDateString()} · {t`Revision ${doc.revision}`}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete this memory?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? memoryTitle(deleting.path) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground"
            >
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
