import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const AUTH_PROXY_TOKEN_HEADER = "x-kith-proxy-token";
export const AUTH_CLIENT_IP_HEADER = "x-kith-client-ip";

export interface AuthClientIpConfig {
  /** Must be overwritten by the edge; the API must not be publicly reachable around it. */
  edgeHeader: string;
  forwardedHeader?: string;
  proxySecret?: string;
}

export function resolveAuthClientIpConfig(
  source: NodeJS.ProcessEnv,
): AuthClientIpConfig | undefined {
  const edgeHeader = source.AUTH_EDGE_IP_HEADER?.trim();
  const forwardedHeader = source.AUTH_FORWARDED_IP_HEADER?.trim();
  const proxySecret = source.AUTH_PROXY_SECRET?.trim();
  if (!edgeHeader && !forwardedHeader && !proxySecret) return undefined;
  if (!edgeHeader) throw new Error("AUTH_EDGE_IP_HEADER is required for client IP normalization");
  const header = (name: string, value: string) => {
    const normalized = value.toLowerCase();
    if (
      !/^[a-z0-9-]+$/.test(normalized) ||
      [AUTH_PROXY_TOKEN_HEADER, AUTH_CLIENT_IP_HEADER, "authorization", "cookie", "host"].includes(
        normalized,
      )
    )
      throw new Error(`${name} must name a dedicated trusted client IP header`);
    return normalized;
  };
  const edge = header("AUTH_EDGE_IP_HEADER", edgeHeader);
  if (Boolean(forwardedHeader) !== Boolean(proxySecret))
    throw new Error("AUTH_PROXY_SECRET and AUTH_FORWARDED_IP_HEADER must be configured together");
  if (proxySecret && !/^[A-Za-z0-9_-]{32,256}$/.test(proxySecret))
    throw new Error("AUTH_PROXY_SECRET must contain 32 to 256 URL-safe characters");
  const forwarded = forwardedHeader
    ? header("AUTH_FORWARDED_IP_HEADER", forwardedHeader)
    : undefined;
  if (forwarded === edge)
    throw new Error("AUTH_FORWARDED_IP_HEADER must differ from AUTH_EDGE_IP_HEADER");
  return { edgeHeader: edge, forwardedHeader: forwarded, proxySecret };
}

function singleIp(value: string | null): string | undefined {
  const ip = value?.trim();
  return ip && !ip.includes("%") && isIP(ip) !== 0 ? ip : undefined;
}

function matchesSecret(value: string | null, secret: string): boolean {
  if (!value || value.length > 256) return false;
  return timingSafeEqual(
    createHash("sha256").update(value).digest(),
    createHash("sha256").update(secret).digest(),
  );
}

/** Normalize only at the auth boundary. Public callers cannot select a forwarded IP
 * without authenticating the upstream proxy; direct traffic uses the edge's IP.
 * Never pass the proxy credential or a caller-supplied synthesized IP to Better Auth. */
export function authRequestWithClientIp(
  request: Request,
  config: AuthClientIpConfig | undefined,
): Request {
  if (!config && !request.headers.has(AUTH_PROXY_TOKEN_HEADER)) return request;
  const headers = new Headers(request.headers);
  const token = headers.get(AUTH_PROXY_TOKEN_HEADER);
  headers.delete(AUTH_PROXY_TOKEN_HEADER);
  if (config) {
    headers.delete(AUTH_CLIENT_IP_HEADER);
    const forwardedIp =
      config.proxySecret && config.forwardedHeader && matchesSecret(token, config.proxySecret)
        ? singleIp(headers.get(config.forwardedHeader))
        : undefined;
    const ip = forwardedIp ?? singleIp(headers.get(config.edgeHeader));
    if (ip) headers.set(AUTH_CLIENT_IP_HEADER, ip);
  }
  return new Request(request, { headers });
}
