import { describe, expect, it } from "vitest";
import { scrollIndicatorGeometry } from "./scroll-indicator";

describe("minimal scroll indicator", () => {
  it("omits the indicator when the content fits or measurements are unavailable", () => {
    for (const content of [0, 200, 500]) {
      expect(scrollIndicatorGeometry({ viewport: 500, content, offset: 0 })).toBeNull();
    }
    expect(scrollIndicatorGeometry({ viewport: 0, content: 1000, offset: 0 })).toBeNull();
    expect(scrollIndicatorGeometry({ viewport: 500, content: Number.NaN, offset: 0 })).toBeNull();
  });

  it("sizes the thumb proportionally and keeps a long-list thumb visible", () => {
    expect(scrollIndicatorGeometry({ viewport: 500, content: 1000, offset: 0 })).toEqual({
      thumb: 242,
      position: 0,
    });
    expect(scrollIndicatorGeometry({ viewport: 500, content: 100000, offset: 0 })?.thumb).toBe(24);
  });

  it("clamps bounce offsets and reverses the position for inverted conversation lists", () => {
    expect(scrollIndicatorGeometry({ viewport: 500, content: 1000, offset: -80 })?.position).toBe(
      0,
    );
    expect(scrollIndicatorGeometry({ viewport: 500, content: 1000, offset: 800 })?.position).toBe(
      242,
    );
    expect(
      scrollIndicatorGeometry({ viewport: 500, content: 1000, offset: 0, inverted: true })
        ?.position,
    ).toBe(242);
    expect(
      scrollIndicatorGeometry({ viewport: 500, content: 1000, offset: 500, inverted: true })
        ?.position,
    ).toBe(0);
  });
});
