import { Trans, useLingui } from "@lingui/react/macro";
import type { IntegrationCatalogResult, IntegrationSetupState } from "@rakazo/contracts";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConnectorIcon,
  Input,
} from "@rakazo/ui-web";
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { connectRemoteMcp } from "../../lib/mcp-install";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type Choice = "direct" | "composio" | "pipedream" | "executor";

export function IntegrationSetup({
  onDone,
  serverSetup = false,
  managedOnly = false,
  initialState,
  initialEndpoint = "",
  botId,
  onServerConnected,
}: {
  onDone?: () => void;
  serverSetup?: boolean;
  /** Local host settings can configure providers, but cannot access account MCP servers. */
  managedOnly?: boolean;
  initialState?: IntegrationSetupState | null;
  initialEndpoint?: string;
  botId?: string;
  onServerConnected?: (id: string) => void;
}) {
  const { t } = useLingui();
  const fieldId = useId();
  const [state, setState] = useState<IntegrationSetupState | null>(initialState ?? null);
  const [selectedChoice, setChoice] = useState<Choice>("composio");
  const choice = serverSetup ? selectedChoice : "direct";
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [serverName, setServerName] = useState("");
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IntegrationCatalogResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const connectionAttempt = useRef<AbortController | null>(null);
  useEffect(() => () => connectionAttempt.current?.abort(), []);
  const [connected, setConnected] = useState<string[]>([]);
  const choices: { id: Choice; label: string }[] = [
    { id: "direct", label: t`Direct MCP` },
    { id: "composio", label: "Composio" },
    { id: "pipedream", label: "Pipedream" },
    { id: "executor", label: "Executor" },
  ];
  const managed = choice === "composio" || choice === "pipedream";
  const hasCredentials = Boolean(apiKey.trim());
  const credentialsReady =
    hasCredentials && (choice !== "pipedream" || Boolean(clientId.trim() && projectId.trim()));
  const remoteResults = [
    ...new Map(
      results.flatMap((result) =>
        result.surfaces
          .filter((surface) => surface.kind === "mcp" && surface.source?.startsWith("https://"))
          .map(
            (surface) =>
              [surface.source!, { name: result.name, endpoint: surface.source! }] as const,
          ),
      ),
    ).values(),
  ];
  const configured = state?.providers.find((provider) => provider.id === choice)?.configured;
  useEffect(() => {
    if (!serverSetup || initialState) return;
    void rpc.integrationSetup
      .get()
      .then(setState)
      .catch(() => setError(t`Could not load integrations`));
  }, [serverSetup, initialState]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, t`Could not connect`));
    } finally {
      setBusy(false);
    }
  }

  async function saveProvider() {
    await run(async () => {
      await rpc.integrationSetup.save(
        choice === "composio"
          ? { provider: "composio", apiKey }
          : {
              provider: "pipedream",
              clientId,
              clientSecret: apiKey,
              projectId,
              environment: "production",
            },
      );
      setApiKey("");
      setState(await rpc.integrationSetup.get());
      onDone?.();
    });
  }

  async function connect(name: string, url: string) {
    await run(async () => {
      connectionAttempt.current?.abort();
      const controller = new AbortController();
      connectionAttempt.current = controller;
      const server = await connectRemoteMcp({
        endpoint: url,
        name,
        secret: apiKey,
        botId,
        signal: controller.signal,
        onAuthorization: setAuthorizationUrl,
      });
      if (!server) {
        if (!controller.signal.aborted)
          setError(t`Connection is unfinished. Try again when you are ready.`);
        return;
      }
      setAuthorizationUrl(null);
      setApiKey("");
      setConnected((current) => [...current, url]);
      onServerConnected?.(server.id);
    });
  }

  if (serverSetup && !state?.canConfigure) return error ? <p role="alert">{error}</p> : null;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-[32px] font-medium text-foreground">
        {!serverSetup ? <ConnectorIcon name="MCP" size={32} /> : null}
        {serverSetup ? t`Server integrations` : t`Add MCP server`}
      </h1>
      {serverSetup ? (
        <fieldset
          aria-label={t`Integration options`}
          className="overflow-hidden rounded-xl border border-border"
        >
          {choices
            .filter(({ id }) => !managedOnly || id === "composio" || id === "pipedream")
            .map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={choice === id}
                disabled={busy}
                onClick={() => {
                  setChoice(id);
                  setApiKey("");
                  setError(null);
                }}
                className={`flex min-h-11 w-full items-center justify-between border-b border-border px-3.5 py-2.5 text-left last:border-0 ${choice === id ? "bg-muted" : "hover:bg-accent"}`}
              >
                <span className="flex items-center gap-2">
                  {id === "direct" ? <ConnectorIcon name="MCP" size={24} /> : null}
                  {label}
                </span>
                {choice === id ? <Check className="size-4" aria-hidden /> : null}
              </button>
            ))}
        </fieldset>
      ) : null}
      {choice === "composio" || choice === "pipedream" ? (
        <>
          {configured ? (
            <p className="text-sm text-success">
              <Trans>Connected</Trans>
            </p>
          ) : null}
          {state?.canConfigure ? (
            <>
              {choice === "pipedream" ? (
                <>
                  <label htmlFor={`${fieldId}-client-id`} className="block text-sm">
                    <Trans>Client ID</Trans>
                    <Input
                      id={`${fieldId}-client-id`}
                      className="mt-2"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label htmlFor={`${fieldId}-project-id`} className="block text-sm">
                    <Trans>Project ID</Trans>
                    <Input
                      id={`${fieldId}-project-id`}
                      className="mt-2"
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : null}
              <label htmlFor={`${fieldId}-key`} className="block text-sm">
                {choice === "composio" ? t`API key` : t`Client secret`}
                <Input
                  id={`${fieldId}-key`}
                  className="mt-2"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <a
                className="text-sm text-muted-foreground underline"
                href={
                  choice === "composio"
                    ? "https://dashboard.composio.dev"
                    : "https://pipedream.com/docs/connect/mcp/developers"
                }
                target="_blank"
                rel="noreferrer"
              >
                <Trans>Get credentials</Trans>
              </a>
              {!onDone ? (
                <Button
                  className="ml-3"
                  disabled={busy || !credentialsReady}
                  onClick={() => void saveProvider()}
                >
                  {busy ? t`Connecting…` : t`Connect`}
                </Button>
              ) : null}
            </>
          ) : state && !configured ? (
            <p className="text-sm text-muted-foreground">
              <Trans>Ask the server owner to configure this provider.</Trans>
            </p>
          ) : null}
        </>
      ) : null}
      {authorizationUrl ? (
        <div className="flex flex-wrap gap-3">
          <a href={authorizationUrl} target="_blank" rel="noreferrer" className="text-sm underline">
            <Trans>Continue in browser</Trans>
          </a>
          {busy ? (
            <Button size="sm" variant="ghost" onClick={() => connectionAttempt.current?.abort()}>
              <Trans>Stop waiting</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {choice === "direct" ? (
        <>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void connect(serverName, endpoint.trim());
            }}
          >
            <Input
              aria-label={t`Server URL`}
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://example.com/mcp"
              disabled={busy}
            />
            <Collapsible>
              <CollapsibleTrigger className="cursor-pointer text-sm text-muted-foreground">
                <Trans>Connection settings</Trans>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <Input
                  aria-label={t`Server name`}
                  value={serverName}
                  onChange={(event) => setServerName(event.target.value)}
                  placeholder={t`Server name (optional)`}
                  disabled={busy}
                />
                <Input
                  aria-label={t`Access token`}
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={t`Access token (optional)`}
                  disabled={busy}
                />
              </CollapsibleContent>
            </Collapsible>
            <Button
              type="submit"
              disabled={busy || !endpoint.trim() || connected.includes(endpoint.trim())}
            >
              {busy
                ? t`Connecting…`
                : connected.includes(endpoint.trim())
                  ? t`Connected`
                  : t`Connect`}
            </Button>
          </form>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const response = await rpc.capabilities.catalogSearch({
                  query,
                  usePublicCatalog: true,
                });
                setResults(response.results);
                setSearched(true);
              });
            }}
          >
            <Input
              aria-label={t`Search apps`}
              placeholder={t`Search apps`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" disabled={busy || !query.trim()}>
              <Trans>Search integrations.sh</Trans>
            </Button>
          </form>
          {remoteResults.map((result) => (
            <div key={result.endpoint} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{result.name}</span>
              <Button
                variant="outline"
                disabled={busy || connected.includes(result.endpoint)}
                onClick={() => void connect(result.name, result.endpoint)}
              >
                {connected.includes(result.endpoint) ? t`Connected` : t`Connect`}
              </Button>
            </div>
          ))}
          {searched && !remoteResults.length ? (
            <p className="text-sm text-muted-foreground">
              <Trans>No remote MCP servers found</Trans>
            </p>
          ) : null}
        </>
      ) : null}
      {choice === "executor" ? (
        <div className="space-y-3">
          <label htmlFor={`${fieldId}-endpoint`} className="block text-sm">
            <Trans>Server URL</Trans>
            <Input
              id={`${fieldId}-endpoint`}
              className="mt-2"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="http://localhost:8000/mcp"
            />
          </label>
          <label htmlFor={`${fieldId}-token`} className="block text-sm">
            <Trans>Access token</Trans>
            <Input
              id={`${fieldId}-token`}
              className="mt-2"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <Button
            disabled={busy || !endpoint.trim()}
            onClick={() => void connect("Executor", endpoint.trim())}
          >
            <Trans>Connect</Trans>
          </Button>
          <Collapsible className="text-sm text-muted-foreground">
            <CollapsibleTrigger className="cursor-pointer">
              <Trans>Setup help</Trans>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <a
                href="https://executor.sh/#get-started"
                target="_blank"
                rel="noreferrer"
                className="mt-2 block underline"
              >
                <Trans>Download Executor</Trans>
              </a>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {onDone ? (
        <div className="flex gap-3">
          <Button
            disabled={
              busy ||
              (managed &&
                state?.canConfigure &&
                !credentialsReady &&
                (!configured || hasCredentials))
            }
            onClick={() => {
              if (managed && hasCredentials) void saveProvider();
              else onDone();
            }}
          >
            {busy ? t`Connecting…` : t`Continue`}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDone}>
            <Trans>Skip</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
