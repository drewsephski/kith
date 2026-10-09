import { useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { Moon, Sun } from "lucide-react";
import { setUiAppearance } from "../lib/ui-appearance";
import { useUiAppearance } from "../lib/use-ui-appearance";

export function ThemeToggle() {
  const { t } = useLingui();
  const { resolved } = useUiAppearance();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "light" ? t`Switch to light mode` : t`Switch to dark mode`;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="app-no-drag"
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      onClick={() => setUiAppearance(next)}
    >
      {next === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
