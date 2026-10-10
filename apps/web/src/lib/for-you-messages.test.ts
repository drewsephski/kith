import { fileURLToPath } from "node:url";
import { createCompiledCatalog, getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";
import { setupI18n } from "@lingui/core";
import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import { describe, expect, it } from "vitest";

import { FOR_YOU_MESSAGES, translateForYouMessage } from "./for-you-messages";

const catalogMessages = new Set(
  FOR_YOU_SUGGESTIONS.flatMap(({ group, title, description }) => [group, title, description]),
);

describe("For You catalog localization", () => {
  it("keeps every shared catalog message statically extractable with a stable ID", () => {
    expect(Object.keys(FOR_YOU_MESSAGES).sort()).toEqual([...catalogMessages].sort());
    for (const message of catalogMessages) {
      expect(FOR_YOU_MESSAGES[message]).toEqual({ id: message, message });
    }
  });

  it("renders all catalog copy from the compiled production catalogs in every supported locale", async () => {
    const config = getConfig({ cwd: fileURLToPath(new URL("../../", import.meta.url)) });
    const [catalog] = await getCatalogs(config);
    if (!catalog) throw new Error("Web translation catalog is missing");
    const sourceEntries = await catalog.read("en");
    const chrome = [
      "All",
      "Tasks",
      "Routines",
      "Level up Kith",
      "For builders",
      "For you",
      "Your work",
      "Connected apps",
      "Explore",
      "Previous categories",
      "More categories",
      "Request queued",
      "Awaiting final approval",
      "Sending…",
      "Sent and verified",
      "Verify before retrying",
      "Unverified email preview",
    ];
    for (const locale of config.locales) {
      const entries = await catalog.read(locale);
      const { messages } = await catalog.getTranslations(locale, {
        sourceLocale: config.sourceLocale,
        fallbackLocales: config.fallbackLocales,
      });
      const compiled = createCompiledCatalog(locale, messages, { namespace: "json" });
      expect(compiled.errors).toEqual([]);
      const runtime = setupI18n({
        locale,
        messages: { [locale]: JSON.parse(compiled.source).messages },
      });
      for (const message of chrome) {
        const ids = Object.entries(sourceEntries ?? {})
          .filter(([, entry]) => entry.message === message)
          .map(([id]) => id);
        expect(ids, `${locale}: ${message}`).not.toHaveLength(0);
        for (const id of ids) {
          expect(entries?.[id]?.translation, `${locale}: ${message}`).toBeTruthy();
          const translated = runtime._({ id, message });
          expect(translated, `${locale}: ${message}`).toBe(entries?.[id]?.translation);
        }
      }
      for (const message of catalogMessages) {
        expect(entries?.[message]?.translation, `${locale}: ${message}`).toBeTruthy();
        expect(entries?.[message]?.obsolete, `${locale}: ${message}`).not.toBe(true);
        const translated = translateForYouMessage(runtime, message);
        expect(translated, `${locale}: ${message}`).toBeTruthy();
        expect(translated).not.toMatch(/\{[A-Za-z0-9_]+\}/);
        if (locale === "en") expect(translated).toBe(message);
        // "General" is correctly spelled the same way in Spanish.
        else if (!(locale === "es" && message === "General")) {
          expect(translated, `${locale}: ${message}`).not.toBe(message);
        }
      }
    }
  });

  it("retains source text for unsupported catalog additions", () => {
    const runtime = setupI18n({ locale: "en", messages: { en: {} } });
    expect(translateForYouMessage(runtime, "Uncatalogued text")).toBe("Uncatalogued text");
  });
});
