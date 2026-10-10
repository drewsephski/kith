import { Trans, useLingui } from "@lingui/react/macro";
import type { ForYouCategory, ForYouSuggestion } from "@rakazo/core";
import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import { Button, NavigationButton, SelectionGroup } from "@rakazo/ui-web";
import { Lightbulb, Menu, PanelLeftOpen, PencilLine, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function ForYouPage({
  onSelect,
  busy = false,
  error,
  onOpenNavigation,
  onShowSidebar,
  windowChrome,
}: {
  onSelect: (suggestion: ForYouSuggestion) => void;
  busy?: boolean;
  error?: string | null;
  onOpenNavigation?: () => void;
  onShowSidebar?: () => void;
  windowChrome?: ReactNode;
}) {
  const { t, i18n } = useLingui();
  const [category, setCategory] = useState<ForYouCategory | "all">("all");
  const filters = [
    { id: "all" as const, label: t`All` },
    { id: "tasks" as const, label: t`Tasks` },
    { id: "routines" as const, label: t`Routines` },
    { id: "learn" as const, label: t`Level up Kith` },
    { id: "builders" as const, label: t`For builders` },
  ];
  const suggestions = FOR_YOU_SUGGESTIONS.filter(
    (suggestion) => category === "all" || category === suggestion.category,
  );
  const groups = [...new Set(suggestions.map((suggestion) => suggestion.group))];
  const translate = (message: string) => i18n._(message);
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
          <nav
            aria-label={t`Suggestion categories`}
            className="rk-scroll flex shrink-0 gap-1 overflow-x-auto px-4 pb-3 md:w-44 md:flex-col md:gap-0.5 md:px-3 md:pb-6"
          >
            {filters.map((filter) => (
              <NavigationButton
                key={filter.id}
                selected={category === filter.id}
                aria-current={false}
                aria-pressed={category === filter.id}
                onClick={() => setCategory(filter.id)}
                className="h-9 w-auto shrink-0 justify-start px-3 md:w-full"
              >
                {filter.label}
              </NavigationButton>
            ))}
          </nav>
        </SelectionGroup>
        <div className="rk-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-12 md:px-8">
          <div className="mx-auto max-w-2xl pt-3 md:pt-1" aria-busy={busy}>
            {error ? (
              <p role="alert" className="mb-6 text-sm text-destructive">
                {error}
              </p>
            ) : null}
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
                          className="h-auto min-h-14 w-full justify-start gap-3 px-2 py-2 text-start font-normal"
                          aria-label={translate(suggestion.title)}
                        >
                          <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
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
