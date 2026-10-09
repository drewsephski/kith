import { describe, expect, it } from "vitest";
import { darkTokens, lightTokens } from "./index.js";

function luminance(hex: string): number {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  if (channels?.length !== 3) throw new Error(`Expected an RGB hex color: ${hex}`);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens],
] as const)("%s palette accessibility", (_theme, palette) => {
  it("keeps body, secondary, selected, and action text above WCAG AA contrast", () => {
    for (const [foreground, background] of [
      [palette.foreground, palette.background],
      [palette.mutedForeground, palette.background],
      [palette.mutedForeground, palette.muted],
      [palette.mutedForeground, palette.sidebar],
      [palette.sidebarAccentForeground, palette.sidebarAccent],
      [palette.primaryForeground, palette.primary],
      [palette.primary, palette.background],
      [palette.link, palette.card],
    ]) {
      expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps focus rings distinguishable from their adjacent surfaces", () => {
    for (const background of [palette.background, palette.card, palette.sidebar]) {
      expect(contrast(palette.ring, background)).toBeGreaterThanOrEqual(3);
    }
  });
});
