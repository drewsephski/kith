import { Trans, useLingui } from "@lingui/react/macro";
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
import { useConnectedServices } from "./shell/assistant-suggestions";

export function ForYouPage({
  onSelect,
  busy = false,
  error,
  onOpenNavigation,
  onShowSidebar,
  windowChrome,
  scopeKey,
  services: connectedServices,
}: {
  onSelect: (suggestion: ForYouSuggestion) => void;
  scopeKey?: string;
  services?: ConnectedAppService[];
  busy?: boolean;
  error?: string | null;
  onOpenNavigation?: () => void;
  onShowSidebar?: () => void;
  windowChrome?: ReactNode;
}) {
  const { t, i18n } = useLingui();
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
