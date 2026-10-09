import { Trans } from "@lingui/react/macro";
import { Button, KithAvatar } from "@rakazo/ui-web";
import { Link, useNavigate } from "react-router-dom";
import { WindowChrome } from "./WindowChrome";

export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-background" data-rakazo-surface="welcome">
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-[90px]">
        <div className="flex items-center gap-[18px] sm:gap-[26px]">
          <KithAvatar size={88} />
          <h1 className="text-[56px] leading-none tracking-[-0.03em] text-foreground sm:text-[76px]">
            Kith
          </h1>
        </div>
        <p className="max-w-[600px] text-center text-[22px] leading-[1.4] text-foreground/75">
          <Trans>A little help with life.</Trans>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" className="app-no-drag" onClick={() => navigate("/sign-up")}>
            <Trans>Sign up</Trans>
          </Button>
          <Link
            to="/sign-in"
            className="app-no-drag rounded-full px-[34px] py-[15px] text-sm font-medium text-foreground/75 transition hover:text-foreground"
          >
            <Trans>Sign in</Trans>
          </Link>
        </div>
      </main>
    </div>
  );
}
