function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Remove only provider-recognized inline image bytes in message content, never arbitrary text/tools. */
export function modelRequestSizes(payload: unknown): {
  requestBytes: number;
  textRequestBytes: number;
} {
  const root = record(payload);
  const stripImage = (part: unknown) => {
    const value = record(part);
    if (!value) return part;
    if (
      value.type === "image" &&
      typeof value.data === "string" &&
      typeof value.mimeType === "string" &&
      value.mimeType.startsWith("image/")
    )
      return { ...value, data: "[image]" };
    if (value.type === "image_url") {
      const image = record(value.image_url);
      if (
        image &&
        typeof image.url === "string" &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image.url)
      )
        return { ...value, image_url: { ...image, url: "[image]" } };
    }
    if (
      value.type === "input_image" &&
      typeof value.image_url === "string" &&
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.image_url)
    )
      return { ...value, image_url: "[image]" };
    return part;
  };
  const stripMessages = (messages: unknown) =>
    Array.isArray(messages)
      ? messages.map((message) => {
          const value = record(message);
          return value && Array.isArray(value.content)
            ? { ...value, content: value.content.map(stripImage) }
            : message;
        })
      : messages;
  const text = root
    ? {
        ...root,
        ...(root.messages !== undefined ? { messages: stripMessages(root.messages) } : {}),
        ...(root.input !== undefined ? { input: stripMessages(root.input) } : {}),
      }
    : payload;
  return {
    requestBytes: Buffer.byteLength(JSON.stringify(payload)),
    textRequestBytes: Buffer.byteLength(JSON.stringify(text)),
  };
}
