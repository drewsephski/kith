import { Trans, useLingui } from "@lingui/react/macro";
import { useForYouRecommendations } from "@rakazo/chat-ui/suggestions";
import type { ConnectedAppService, ForYouCategory, ForYouSuggestion } from "@rakazo/core";
import { availableForYouSuggestions } from "@rakazo/core";
import { Button, ConnectorIcon, NavigationButton, SelectionGroup } from "@rakazo/ui-web";
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Menu,
  PanelLeftOpen,
  PencilLine,
  Repeat2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { translateForYouMessage } from "../lib/for-you-messages";
import { rpc, selectedSpaceId } from "../lib/rpc";
import { useConnectedServices } from "./shell/assistant-suggestions";

const loadRecommendations = (assistantId: string, signal: AbortSignal) =>
  rpc.forYou.discover({ assistantId }, { signal, context: { spaceId: selectedSpaceId() } });
const dismissRecommendation = (
  assistantId: string,
  recommendationId: string,
  action: "dismiss" | "snooze",
) =>
  rpc.forYou.dismiss(
    { assistantId, recommendationId, action },
    { context: { spaceId: selectedSpaceId() } },
  );

export function ForYouPage({
  onSelect,
  busy = false,
  error,
  onOpenNavigation,
  onShowSidebar,
  windowChrome,
  scopeKey,
  assistantId,
  services: connectedServices,
}: {
  onSelect: (suggestion: ForYouSuggestion) => void;
  scopeKey?: string;
  assistantId?: string | null;
  services?: ConnectedAppService[];
  busy?: boolean;
  error?: string | null;
  onOpenNavigation?: () => void;
  onShowSidebar?: () => void;
  windowChrome?: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const discovery = useForYouRecommendations({
    scopeKey,
    assistantId,
    load: loadRecommendations,
    dismiss: dismissRecommendation,
  });
  const [dispositionError, setDispositionError] = useState(false);
  const categoryNav = useRef<HTMLElement>(null);
  const [categoryScroll, setCategoryScroll] = useState({ before: false, after: false });
  const updateCategoryScroll = () => {
    const nav = categoryNav.current;
    if (nav)
      setCategoryScroll({
        before: nav.scrollLeft > 1,
        after: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      });
  };
  useEffect(() => {
    const nav = categoryNav.current;
    if (!nav) return;
    const observer = new ResizeObserver(updateCategoryScroll);
    observer.observe(nav);
    updateCategoryScroll();
    return () => observer.disconnect();
  }, []);
  const discoveredServices = useConnectedServices(
    connectedServices === undefined ? scopeKey : undefined,
  );
  const services = connectedServices ?? discoveredServices;
  const [category, setCategory] = useState<ForYouCategory | "all">("all");
  const filters = [
    { id: "all" as const, label: t`All` },
    { id: "tasks" as const, label: t`Tasks` },
    { id: "routines" as const, label: t`Routines` },
    { id: "learn" as const, label: t`Level up Kith` },
    { id: "builders" as const, label: t`For builders` },
  ];
  const suggestions = availableForYouSuggestions(services.map((service) => service.slug)).filter(
    (suggestion) => category === "all" || category === suggestion.category,
  );
  const groups = [...new Set(suggestions.map((suggestion) => suggestion.group))];
  const translate = (message: string) => translateForYouMessage(i18n, message);
  return (
    <section data-testid="for-you-page" className="flex min-h-0 flex-1 flex-col">
      <header className="app-drag flex h-16 shrink-0 items-center gap-2 px-3 md:px-7">
        {windowChrome}
        {onOpenNavigation ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="app-no-drag md:hidden"
            aria-label={t`Open navigation`}
            onClick={onOpenNavigation}
          >
            <Menu size={19} />
          </Button>
        ) : null}
        {onShowSidebar ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="app-no-drag hidden md:flex"
            aria-label={t`Show sidebar`}
            onClick={onShowSidebar}
          >
            <PanelLeftOpen size={19} />
          </Button>
        ) : null}
        <h1 className="px-2 text-sm font-medium">
          <Trans>For you</Trans>
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SelectionGroup>
          <div className="flex min-w-0 shrink-0 items-start border-b border-border px-2 md:contents">
            {categoryScroll.before ? (
              <Button
                variant="ghost"
                aria-label={t`Previous categories`}
                className="h-11 w-9 shrink-0 px-0 md:hidden"
                onClick={() => categoryNav.current?.scrollBy({ left: -240 })}
              >
                <ChevronLeft size={16} />
              </Button>
            ) : null}
            <nav
              ref={categoryNav}
              onScroll={updateCategoryScroll}
              aria-label={t`Suggestion categories`}
              className="rk-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 pb-2 scroll-px-2 md:w-44 md:flex-none md:flex-col md:gap-0.5 md:border-0 md:px-3 md:pb-6"
            >
              {filters.map((filter) => (
                <NavigationButton
                  key={filter.id}
                  selected={category === filter.id}
                  aria-current={false}
                  aria-pressed={category === filter.id}
                  onClick={(event) => {
                    setCategory(filter.id);
                    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
                  }}
                  className="h-11 w-auto shrink-0 justify-start px-3 md:h-9 md:w-full"
                >
                  {filter.label}
                </NavigationButton>
              ))}
            </nav>
            {categoryScroll.after ? (
              <Button
                variant="ghost"
                aria-label={t`More categories`}
                className="h-11 w-9 shrink-0 px-0 md:hidden"
                onClick={() => categoryNav.current?.scrollBy({ left: 240 })}
              >
                <ChevronRight size={16} />
              </Button>
            ) : null}
          </div>
        </SelectionGroup>
        <div className="rk-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-12 md:px-8">
          <div className="mx-auto max-w-2xl pt-3 md:pt-1" aria-busy={busy}>
            {error ? (
              <p role="alert" className="mb-6 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {assistantId ? (
              <section
                aria-label={t`Recommended`}
                className="mb-8"
                data-testid="for-you-recommendations"
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-2">
                  <h2 className="text-sm font-medium">
                    <Trans>Recommended</Trans>
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || discovery.loading || !assistantId}
                    onClick={discovery.refresh}
                  >
                    <Trans>Refresh</Trans>
                  </Button>
                </div>
                {discovery.loading ? (
                  <p role="status" className="px-2 text-sm text-muted-foreground">
                    <Trans>Checking your sources…</Trans>
                  </p>
                ) : discovery.unavailable ? (
                  <p role="status" className="px-2 text-sm text-muted-foreground">
                    <Trans>Some sources are unavailable. Try refreshing.</Trans>
                  </p>
                ) : !discovery.recommendations.length ? (
                  <p className="px-2 text-sm text-muted-foreground">
                    <Trans>No grounded recommendations right now.</Trans>
                  </p>
                ) : null}
                {dispositionError ? (
                  <p role="alert" className="px-2 text-sm text-destructive">
                    <Trans>Could not update this recommendation. Try again.</Trans>
                  </p>
                ) : null}
                {discovery.recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="mb-3 rounded-xl border border-border p-3">
                    <Button
                      variant="ghost"
                      disabled={busy}
                      className="h-auto w-full justify-start whitespace-normal px-0 text-start"
                      onClick={() =>
                        onSelect({
                          id: recommendation.id,
                          title: recommendation.title,
                          description: recommendation.description,
                          group: "Recommended",
                          category: "tasks",
                          prompt: "",
                          recommendation,
                        })
                      }
                    >
                      {recommendation.title}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {recommendation.description}
                    </p>
                    {recommendation.startsAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(recommendation.startsAt).toLocaleString(i18n.locale || "en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {recommendation.sources.map((source) =>
                        source.url ? (
                          <a
                            key={source.id}
                            className="underline underline-offset-2"
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.title}
                          </a>
                        ) : (
                          <span key={source.id}>{source.title}</span>
                        ),
                      )}
                      <time dateTime={recommendation.discoveredAt}>
                        {new Date(recommendation.discoveredAt).toLocaleTimeString(
                          i18n.locale || "en",
                          { hour: "numeric", minute: "2-digit" },
                        )}
                      </time>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {(["snooze", "dismiss"] as const).map((action) => (
                        <Button
                          key={action}
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setDispositionError(false);
                            void discovery
                              .dismiss(recommendation.id, action)
                              .catch(() => setDispositionError(true));
                          }}
                        >
                          {action === "snooze" ? t`Tomorrow` : t`Dismiss`}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
            {services.length ? (
              <section
                aria-label={t`Connected apps`}
                className="mb-8"
                data-testid="for-you-connected"
              >
                <h2 className="mb-3 px-2 text-xs font-medium">
                  <Trans>Connected apps</Trans>
                </h2>
                <ul className="flex flex-wrap gap-x-6 gap-y-3 px-2">
                  {services.map((service) => (
                    <li
                      key={service.key}
                      className="flex min-w-0 max-w-full items-center gap-2 text-sm"
                    >
                      <ConnectorIcon
                        name={service.name}
                        brand={service.slug}
                        logo={service.logo}
                        size={28}
                      />
                      <span className="min-w-0 break-words">{service.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <h2 className="mb-5 px-2 text-sm font-medium">
              <Trans>Explore</Trans>
            </h2>
            {groups.map((group) => (
              <section key={group} aria-label={translate(group)} className="mb-10 last:mb-0">
                <h2 className="mb-3 px-2 text-xs font-medium">{translate(group)}</h2>
                <div className="space-y-1">
                  {suggestions
                    .filter((suggestion) => suggestion.group === group)
                    .map((suggestion) => {
                      const Icon =
                        suggestion.category === "routines"
                          ? Repeat2
                          : suggestion.category === "learn"
                            ? Lightbulb
                            : PencilLine;
                      return (
                        <Button
                          key={suggestion.id}
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onSelect(suggestion)}
                          className="h-auto min-h-14 w-full items-start justify-start gap-3 px-2 py-2 text-start font-normal"
                          aria-label={translate(suggestion.title)}
                        >
                          <Icon
                            size={15}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="min-w-0 whitespace-normal">
                            <span className="block text-sm leading-5">
                              {translate(suggestion.title)}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                              {translate(suggestion.description)}
                            </span>
                          </span>
                        </Button>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
