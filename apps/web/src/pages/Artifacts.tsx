import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Artifact, ArtifactVersion, Bot } from "@rakazo/contracts";
import { isAttachmentImageMimeType } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  BotAvatar,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  SelectField,
} from "@rakazo/ui-web";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  FolderOpen,
  Lock,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PdfViewer } from "../components/PdfViewer";
import { SandboxedHtmlViewer } from "../components/SandboxedHtmlViewer";
import { decodeArtifactBase64, downloadArtifactBytes } from "../lib/artifact-open";
import { takeInitialBootstrap } from "../lib/bootstrap";
import { formatRelativeTime } from "../lib/relative-time";
import { rpc } from "../lib/rpc";
import { useObjectUrl } from "../lib/use-object-url";
import { errorText } from "../lib/user-error";

type DateFilter = "all" | "today" | "week" | "month";
const LIST_PAGE_SIZE = 60;
type ArtifactSummary = Artifact & { versionCount: number };

function matchesCalendarDateFilter(iso: string, filter: DateFilter, now: Date): boolean {
  if (filter === "all") return true;
  const date = new Date(iso);
  if (filter === "today") return date.toDateString() === now.toDateString();
  if (filter === "week") {
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    return date >= startOfWeek;
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function ArtifactsPage() {
  const { artifactId } = useParams<{ artifactId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLingui();
  const [bots, setBots] = useState<Bot[]>([]);
  const [items, setItems] = useState<ArtifactSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const listingGenerationRef = useRef(0);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<ArtifactSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void takeInitialBootstrap().then((bootstrap) => setBots(bootstrap.bots));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listingGenerationRef.current += 1;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setMoreError(null);
    setItems(null);
    setLoadError(null);
    setNextCursor(null);
    void rpc.artifacts
      .listSpace({ botId: activeBotId ?? undefined, limit: LIST_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(errorText(error, t`Could not load artifacts.`));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBotId, t]);

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;
    const generation = listingGenerationRef.current;
    const listingChanged = () => generation !== listingGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await rpc.artifacts.listSpace({
        botId: activeBotId ?? undefined,
        cursor: nextCursor,
        limit: LIST_PAGE_SIZE,
      });
      if (listingChanged()) return;
      setItems((current) => (current ?? []).concat(page.items));
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (!listingChanged()) setMoreError(errorText(error, t`Could not load more files.`));
    } finally {
      if (!listingChanged()) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots]);

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const now = new Date();
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesCalendarDateFilter(item.createdAt, dateFilter, now)) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [items, searchQuery, dateFilter]);

  const clientFilterActive = searchQuery.trim().length > 0 || dateFilter !== "all";
  const autoFetchedCursorRef = useRef<string | null>(null);

  useEffect(() => {
    autoFetchedCursorRef.current = null;
  }, [searchQuery, dateFilter, activeBotId]);

  // Search and date filters only see loaded pages, so keep paging until something matches.
  useEffect(() => {
    if (!clientFilterActive || !nextCursor || loadingMore || items === null) return;
    if (filteredItems && filteredItems.length > 0) return;
    if (autoFetchedCursorRef.current === nextCursor) return;
    autoFetchedCursorRef.current = nextCursor;
    void loadMore();
  }, [clientFilterActive, nextCursor, loadingMore, items, filteredItems]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await rpc.artifacts.remove({ artifactId: pendingDelete.id });
      setItems((current) => current?.filter((item) => item.id !== pendingDelete.id) ?? current);
      if (artifactId === pendingDelete.id)
        navigate("/app/artifacts", { replace: true, state: location.state });
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(errorText(error, t`Could not delete this artifact.`));
    } finally {
      setDeleteBusy(false);
    }
  }

  function close() {
    if (location.state?.filesBackground) navigate(-1);
    else navigate("/app", { replace: true });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !deleteBusy) close();
      }}
    >
      <DialogContent
        data-testid="files-dialog"
        aria-describedby={undefined}
        className={`flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 ${artifactId ? "h-[640px] sm:max-w-3xl" : "h-[520px] sm:max-w-xl"}`}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 pe-12">
          {artifactId ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t`Back to files`}
              onClick={() => navigate("/app/artifacts", { replace: true, state: location.state })}
            >
              <ChevronLeft />
            </Button>
          ) : (
            <FolderOpen className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <DialogTitle className="text-sm">
            <Trans>Files</Trans>
          </DialogTitle>
          {artifactId ? (
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          ) : null}
          {artifactId ? (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {items?.find((item) => item.id === artifactId)?.name}
            </span>
          ) : null}
        </header>
        {!artifactId ? (
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label={t`Search files`}
                  placeholder={t`Search files…`}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="ps-8"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t`Filters`}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Filter
                  className={
                    activeBotId || dateFilter !== "all" ? "text-primary" : "text-muted-foreground"
                  }
                />
              </Button>
            </div>
            {filtersOpen ? (
              <div className="mt-2 flex gap-2">
                <SelectField
                  aria-label={t`Conversation`}
                  className="min-w-0 flex-1"
                  value={activeBotId ?? "all"}
                  onValueChange={(value) => setActiveBotId(value === "all" ? null : value)}
                  items={[
                    { value: "all", label: t`All conversations` },
                    ...bots.map((bot) => ({ value: bot.id, label: bot.name })),
                  ]}
                />
                <SelectField
                  aria-label={t`Filter by date`}
                  className="min-w-0 flex-1"
                  value={dateFilter}
                  onValueChange={(value) => setDateFilter(value as DateFilter)}
                  items={[
                    { value: "all", label: t`All time` },
                    { value: "today", label: t`Today` },
                    { value: "week", label: t`This week` },
                    { value: "month", label: t`This month` },
                  ]}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {moreError ? (
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            {moreError}
          </p>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {artifactId ? (
            <PreviewPane key={artifactId} artifactId={artifactId} />
          ) : (
            <BrowsingPane
              items={filteredItems}
              loadError={loadError}
              botsById={botsById}
              onRequestDelete={setPendingDelete}
              nextCursor={nextCursor}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          )}
        </div>
        {pendingDelete ? (
          <AlertDialog
            open
            onOpenChange={(open) => {
              if (!open && !deleteBusy) setPendingDelete(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>Delete "{pendingDelete.name}"?</Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDelete.versionCount > 1 ? (
                    <Trans>
                      This deletes all {pendingDelete.versionCount} versions of this artifact. This
                      can't be undone.
                    </Trans>
                  ) : (
                    <Trans>This can't be undone.</Trans>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError ? <p className="text-[13.5px] text-destructive">{deleteError}</p> : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteBusy}>
                  <Trans>Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteBusy}
                  onClick={() => void confirmDelete()}
                >
                  {deleteBusy ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BrowsingPane({
  items,
  loadError,
  botsById,
  onRequestDelete,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  items: ArtifactSummary[] | null;
  loadError: string | null;
  botsById: Map<string, Bot>;
  onRequestDelete: (artifact: ArtifactSummary) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (items === null) {
    return (
      <div className="grid flex-1 place-items-center text-sm text-muted-foreground/80">
        {loadError ?? <Trans>Loading…</Trans>}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyArtifacts
        className="grid flex-1 place-items-center text-sm text-muted-foreground/80"
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="flex flex-col">
        {items.map((item) => (
          <ArtifactRow
            key={item.id}
            artifact={item}
            bot={item.botId ? botsById.get(item.botId) : undefined}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
      {nextCursor ? <LoadMoreButton loading={loadingMore} onClick={onLoadMore} /> : null}
    </div>
  );
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" size="sm" disabled={loading} onClick={onClick}>
        {loading ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
      </Button>
    </div>
  );
}

function EmptyArtifacts({
  className,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  className: string;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!nextCursor) {
    return (
      <div className={className}>
        <Trans>No artifacts found.</Trans>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-3">
        <span>
          {loadingMore ? (
            <Trans>Loading…</Trans>
          ) : (
            <Trans>No matching artifacts on this page.</Trans>
          )}
        </span>
        <LoadMoreButton loading={loadingMore} onClick={onLoadMore} />
      </div>
    </div>
  );
}

function ArtifactRow({
  artifact,
  bot,
  onRequestDelete,
}: {
  artifact: ArtifactSummary;
  bot: Bot | undefined;
  onRequestDelete: (artifact: ArtifactSummary) => void;
}) {
  const { t } = useLingui();
  const location = useLocation();
  return (
    <div className="group relative rounded-lg hover:bg-accent/60">
      <Link
        to={`/app/artifacts/${artifact.id}`}
        replace
        state={location.state}
        className="flex flex-col gap-1 rounded-lg px-3 py-2.5 pe-12 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground">
            <ArtifactMimeIcon mimeType={artifact.mimeType} small />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{artifact.name}</span>
          {artifact.versionCount > 1 ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {`v${artifact.version}`}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 ps-8 text-[11.5px] text-muted-foreground">
          {bot ? (
            <>
              <BotAvatar color={bot.color} identity={bot.id} size={14} status={bot.status} />
              <span className="max-w-[140px] truncate">{bot.name}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{mimeLabel(artifact.mimeType)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(artifact.createdAt)}</span>
        </div>
      </Link>
      <button
        type="button"
        aria-label={t`Delete ${artifact.name}`}
        title={t`Delete ${artifact.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestDelete(artifact);
        }}
        className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 size={14} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function ArtifactMimeIcon({ mimeType, small }: { mimeType: string; small?: boolean }) {
  const size = small ? 12 : 16;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {mimeType === "text/html" ? (
        <>
          <polyline points="8 6 2 12 8 18" />
          <polyline points="16 6 22 12 16 18" />
        </>
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </>
      )}
    </svg>
  );
}

function mimeLabel(mimeType: string): string {
  if (mimeType === "text/html") return "HTML";
  if (mimeType === "text/markdown") return "MD";
  if (mimeType === "application/pdf") return "PDF";
  const slash = mimeType.indexOf("/");
  return (slash === -1 ? mimeType : mimeType.slice(slash + 1)).toUpperCase().slice(0, 6);
}

function PreviewPane({ artifactId }: { artifactId: string }) {
  const { t } = useLingui();
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; artifact: Artifact; bytes: Uint8Array }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setSelectedVersionId(null);
    void rpc.artifacts
      .listVersions({ familyId: artifactId })
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setSelectedVersionId(list[0]?.id ?? artifactId);
      })
      .catch(() => {
        if (!cancelled) setSelectedVersionId(artifactId);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let cancelled = false;
    setState({ status: "loading" });
    void rpc.artifacts
      .getById({ artifactId: selectedVersionId })
      .then((artifact) => {
        if (!cancelled) {
          setState({
            status: "ready",
            artifact,
            bytes: decodeArtifactBase64(artifact.contentBase64),
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: errorText(error, t`Could not load this artifact.`),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVersionId, t]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h2 className="truncate text-sm font-medium">
            {state.status === "ready" ? state.artifact.name : t`Loading…`}
          </h2>
          {state.status === "ready" && state.artifact.description ? (
            <p className="truncate text-[12.5px] text-muted-foreground">
              {state.artifact.description}
            </p>
          ) : null}
        </div>
        {versions && versions.length > 1 && selectedVersionId ? (
          <SelectField
            aria-label={t`Version`}
            className="w-auto shrink-0 text-sm"
            value={selectedVersionId}
            onValueChange={(selectedValue) => setSelectedVersionId(selectedValue)}
            items={[
              ...versions.map((entry) => ({
                value: String(entry.id),
                label: <>{`v${entry.version} · ${formatRelativeTime(entry.createdAt)}`}</>,
              })),
            ]}
          />
        ) : null}
        {state.status === "ready" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadArtifactBytes(state.artifact.name, state.artifact.mimeType, state.bytes)
            }
          >
            <Download className="me-1.5" size={15} strokeWidth={1.9} />
            <Trans>Download</Trans>
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 p-3">
        {state.status === "loading" ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground/80">
            <Trans>Loading…</Trans>
          </div>
        ) : state.status === "error" ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
            {state.message}
          </div>
        ) : (
          <div className="relative h-full overflow-hidden rounded-lg border border-border">
            <ArtifactPreview artifact={state.artifact} bytes={state.bytes} />
            {state.artifact.mimeType === "text/html" ? (
              <div className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-xs text-white">
                <Lock size={12} strokeWidth={2} />
                <span>
                  <Trans>Isolated preview — no access to your account</Trans>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactPreview({ artifact, bytes }: { artifact: Artifact; bytes: Uint8Array }) {
  if (artifact.mimeType === "text/html") {
    const html = new TextDecoder("utf-8").decode(bytes);
    return <SandboxedHtmlViewer html={html} title={artifact.name} />;
  }
  if (artifact.mimeType === "text/markdown") {
    const text = new TextDecoder("utf-8").decode(bytes);
    return (
      <div className="h-full overflow-y-auto bg-background">
        <article className="mx-auto w-full max-w-[760px] px-5 py-6 text-sm leading-6 text-foreground">
          <ChatMarkdown>{text}</ChatMarkdown>
        </article>
      </div>
    );
  }
  if (artifact.mimeType === "application/pdf") {
    return <PdfViewer bytes={bytes} title={artifact.name} />;
  }
  if (isAttachmentImageMimeType(artifact.mimeType)) {
    return <ImagePreview bytes={bytes} mimeType={artifact.mimeType} name={artifact.name} />;
  }
  return (
    <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground/80">
      <Trans>Preview isn't available for this file type — download it to view it.</Trans>
    </div>
  );
}

function ImagePreview({
  bytes,
  mimeType,
  name,
}: {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}) {
  const url = useObjectUrl(bytes, mimeType);
  if (!url) return null;
  return (
    <div className="grid h-full place-items-center overflow-auto bg-muted/40 p-4">
      <img src={url} alt={name} className="max-h-full max-w-full rounded-lg shadow-sm" />
    </div>
  );
}
