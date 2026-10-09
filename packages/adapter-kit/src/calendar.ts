import type { CalendarOAuthConfig, CalendarSnapshot, CalendarSource } from "@rakazo/contracts";
import type { AdapterContext } from "./types.js";

export type CalendarTokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type CalendarWindow = {
  date: string;
  timezone: string;
  timeMin: string;
  timeMax: string;
};

/** Read access is independent of where OAuth credentials are held. */
export interface CalendarReader {
  sources(context: AdapterContext): Promise<CalendarSource[]>;
  events(
    input: CalendarWindow & { sources: CalendarSource[] },
    context: AdapterContext,
  ): Promise<CalendarSnapshot>;
}

export interface ManagedCalendarProvider {
  configured(): Promise<string | null>;
  reader(
    connection: { connectorId: string; provider: string; providerRef: string },
    context: AdapterContext,
  ): Promise<CalendarReader>;
}

/** Provider translation is confined to adapters. All operations are read-only. */
export interface CalendarProvider {
  authorizationUrl(
    config: CalendarOAuthConfig,
    input: { redirectUri: string; state: string; challenge: string },
  ): string;
  exchange(
    config: CalendarOAuthConfig,
    input: { code: string; verifier: string; redirectUri: string },
    context: AdapterContext,
  ): Promise<CalendarTokens>;
  refresh(
    config: CalendarOAuthConfig,
    tokens: CalendarTokens,
    context: AdapterContext,
  ): Promise<CalendarTokens>;
  revoke(tokens: CalendarTokens, context: AdapterContext): Promise<void>;
  sources(tokens: CalendarTokens, context: AdapterContext): Promise<CalendarSource[]>;
  events(
    tokens: CalendarTokens,
    input: {
      sources: CalendarSource[];
      date: string;
      timezone: string;
      timeMin: string;
      timeMax: string;
    },
    context: AdapterContext,
  ): Promise<CalendarSnapshot>;
}

export class CalendarAccessError extends Error {
  constructor() {
    super("Reconnect Google Calendar to continue");
  }
}
