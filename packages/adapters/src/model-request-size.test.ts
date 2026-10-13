import { describe, expect, it } from "vitest";
import { modelRequestSizes } from "./model-request-size.js";

describe("model request size limits", () => {
  const image = "A".repeat(300000);
  it("preserves a normal screenshot while measuring all text and tool schemas", () => {
    const payload = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this screenshot" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } },
          ],
        },
      ],
      tools: [{ function: { name: "fixture", description: "Tool content" } }],
    };
    const result = modelRequestSizes(payload);
    expect(result.requestBytes).toBeGreaterThan(131072);
    expect(result.requestBytes).toBeLessThan(8 * 1024 * 1024);
    expect(result.textRequestBytes).toBeLessThan(1000);
    expect(payload.messages[0]!.content[1]!.image_url!.url).toContain(image);
  });

  it("only excludes typed image parts inside actual message content", () => {
    const fakeImage = { type: "image", data: image, mimeType: "image/png" };
    expect(
      modelRequestSizes({ tools: [fakeImage], messages: [] }).textRequestBytes,
    ).toBeGreaterThan(131072);
    expect(
      modelRequestSizes({
        messages: [{ content: [{ type: "text", text: JSON.stringify(fakeImage) }] }],
      }).textRequestBytes,
    ).toBeGreaterThan(131072);
    expect(
      modelRequestSizes({
        messages: [{ content: [{ type: "image_url", image_url: { url: image } }] }],
      }).textRequestBytes,
    ).toBeGreaterThan(131072);
    expect(
      modelRequestSizes({ messages: [{ content: [fakeImage] }] }).textRequestBytes,
    ).toBeLessThan(1000);
  });
});
