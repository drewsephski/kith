/**
 * Lingui macros compile away in the app build. Source tests render `t` in English
 * and preserve explicitly identified message descriptors for the real i18n runtime.
 */
export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw(strings, ...values);
}

export function msg<T extends { id: string; message?: string }>(descriptor: T): T {
  return descriptor;
}
