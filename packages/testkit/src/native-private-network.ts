export type NativePrivateNetworkEvidence = {
  privateRequests: number;
  authRequests: number;
  rpcRequests: number;
  voiceRequests: number;
  bearerRequests: number;
  successfulBearerRpcResponses: number;
  errorResponses: number;
  streamResponses: number;
  requestCachePolicyFailures: number;
  cookieFailures: number;
  responseCachePolicyFailures: number;
  successfulRpcWithoutBearerFailures: number;
};

/** Observe native HTTP metadata without retaining paths, credentials or private payloads. */
export function createNativePrivateNetworkRecorder() {
  const evidence: NativePrivateNetworkEvidence = {
    privateRequests: 0,
    authRequests: 0,
    rpcRequests: 0,
    voiceRequests: 0,
    bearerRequests: 0,
    successfulBearerRpcResponses: 0,
    errorResponses: 0,
    streamResponses: 0,
    requestCachePolicyFailures: 0,
    cookieFailures: 0,
    responseCachePolicyFailures: 0,
    successfulRpcWithoutBearerFailures: 0,
  };
  return {
    observe(request: Request, response: Response): void {
      const pathname = new URL(request.url).pathname;
      // Anonymous server probes contain no account data and retain public networking behavior.
      if (pathname === "/rpc/health") return;
      const auth = pathname.startsWith("/api/auth/");
      const rpc = pathname.startsWith("/rpc/");
      const voice = pathname.startsWith("/api/voice/");
      if (!auth && !rpc && !voice) return;
      const bearer = /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
      evidence.privateRequests += 1;
      if (auth) evidence.authRequests += 1;
      if (rpc) evidence.rpcRequests += 1;
      if (voice) evidence.voiceRequests += 1;
      if (bearer) evidence.bearerRequests += 1;
      if (rpc && response.ok && bearer) evidence.successfulBearerRpcResponses += 1;
      if (response.status >= 400) evidence.errorResponses += 1;
      if (response.headers.get("content-type")?.startsWith("text/event-stream"))
        evidence.streamResponses += 1;
      const requestPolicy = cacheDirectives(request.headers);
      if (!requestPolicy.has("no-store") || !requestPolicy.has("no-cache"))
        evidence.requestCachePolicyFailures += 1;
      if (request.headers.has("cookie")) evidence.cookieFailures += 1;
      if (!cacheDirectives(response.headers).has("no-store"))
        evidence.responseCachePolicyFailures += 1;
      if (rpc && response.ok && !bearer) evidence.successfulRpcWithoutBearerFailures += 1;
    },
    snapshot(): NativePrivateNetworkEvidence {
      return { ...evidence };
    },
    assert(): void {
      if (
        !evidence.authRequests ||
        !evidence.rpcRequests ||
        !evidence.successfulBearerRpcResponses ||
        !evidence.streamResponses ||
        evidence.requestCachePolicyFailures ||
        evidence.cookieFailures ||
        evidence.responseCachePolicyFailures ||
        evidence.successfulRpcWithoutBearerFailures
      )
        throw new Error(`Native private network acceptance failed: ${JSON.stringify(evidence)}`);
    },
  };
}

function cacheDirectives(headers: Headers): Set<string> {
  return new Set(
    (headers.get("cache-control") ?? "")
      .split(",")
      .map((value) => value.trim().split("=", 1)[0]!.toLowerCase()),
  );
}
