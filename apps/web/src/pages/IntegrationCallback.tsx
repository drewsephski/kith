import { Trans } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";

/** Provider redirects are informational. Only the originating authenticated app
 * can verify account ownership and complete the pending connection. */
export function IntegrationCallbackPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div className="max-w-sm space-y-4">
        <p className="text-foreground">
          <Trans>Return to the app to finish connecting.</Trans>
        </p>
        <Button type="button" variant="outline" onClick={() => window.close()}>
          <Trans>Close tab</Trans>
        </Button>
      </div>
    </main>
  );
}
