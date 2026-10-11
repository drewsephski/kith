import { ATTACHMENT_MAX_COUNT } from "@rakazo/contracts";
import type { SharePayload } from "expo-sharing";

/** Raw URLs remain text; resolving them must never make an unsolicited network request. */
export function parseIncomingShare(
  payloads: readonly SharePayload[],
  allowedFileRoots: readonly string[],
) {
  if (!payloads.length) throw new Error("No shared content is available");
  if (payloads.length > ATTACHMENT_MAX_COUNT + 1) throw new Error("Too many shared items");
  const text: string[] = [];
  const files: { uri: string; name: string; mimeType?: string }[] = [];
  for (const payload of payloads) {
    if (typeof payload.value !== "string" || !payload.value.trim())
      throw new Error("Shared content is empty");
    if (payload.shareType === "text") text.push(payload.value);
    else if (payload.shareType === "url") {
      const url = new URL(payload.value);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
        throw new Error("This shared link is not supported");
      text.push(url.toString());
    } else {
      const url = new URL(payload.value);
      if (
        url.protocol !== "file:" ||
        url.hostname ||
        !allowedFileRoots.some((root) => {
          const base = new URL(root);
          return (
            base.protocol === "file:" &&
            url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
          );
        })
      )
        throw new Error("This shared file is not accessible");
      const name = decodeURIComponent(url.pathname.split("/").at(-1) ?? "file");
      if (!name || name.includes("/") || name.includes("\\") || Array.from(name).some((char) => char.charCodeAt(0) < 32))
        throw new Error("This shared filename is not supported");
      files.push({ uri: url.toString(), name, mimeType: payload.mimeType });
    }
  }
  const prompt = text.join("\n\n");
  if (prompt.length > 20000) throw new Error("Shared text is too long");
  if (files.length > ATTACHMENT_MAX_COUNT) throw new Error("Too many shared files");
  return { text: prompt, files };
}
