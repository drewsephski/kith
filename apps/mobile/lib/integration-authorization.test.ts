import { openBrowserAsync, WebBrowserResultType } from "expo-web-browser";
import { beforeEach, expect, it, vi } from "vitest";
import { openIntegrationAuthorization } from "./integration-authorization";

vi.mock("expo-web-browser", () => ({
  openBrowserAsync: vi.fn(),
  WebBrowserResultType: { CANCEL: "cancel" },
}));
beforeEach(() => vi.clearAllMocks());

it("opens provider consent with native browser controls without claiming connection status", async () => {
  vi.mocked(openBrowserAsync).mockResolvedValue({ type: WebBrowserResultType.CANCEL });
  await expect(
    openIntegrationAuthorization("https://provider.example.test/connect"),
  ).resolves.toBeUndefined();
  expect(openBrowserAsync).toHaveBeenCalledWith("https://provider.example.test/connect");
});

it.each([
  "javascript:alert(1)",
  "http://provider.example.test",
  "https://user:secret@provider.example.test",
])("rejects unsafe authorization links: %s", async (value) => {
  await expect(openIntegrationAuthorization(value)).rejects.toThrow();
  expect(openBrowserAsync).not.toHaveBeenCalled();
});
