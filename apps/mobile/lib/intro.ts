import * as SecureStore from "expo-secure-store";

const KEY = "kith.intro.v1";
export type IntroProgress = { scene: number; complete: boolean };
let memory: IntroProgress | null = null;
let writes: Promise<void> = Promise.resolve();

export function parseIntroProgress(value: string | null): IntroProgress {
  try {
    const data: unknown = value ? JSON.parse(value) : null;
    if (
      data &&
      typeof data === "object" &&
      "scene" in data &&
      "complete" in data &&
      typeof data.scene === "number" &&
      Number.isInteger(data.scene) &&
      data.scene >= 0 &&
      data.scene <= 2 &&
      typeof data.complete === "boolean"
    )
      return { scene: data.scene, complete: data.complete };
  } catch {
    /* An interrupted or older record starts the introduction again. */
  }
  return { scene: 0, complete: false };
}

export async function loadIntroProgress(): Promise<IntroProgress> {
  if (memory) return memory;
  memory = parseIntroProgress(await SecureStore.getItemAsync(KEY));
  return memory;
}

export function saveIntroProgress(progress: IntroProgress): Promise<void> {
  const task = async () => {
    await SecureStore.setItemAsync(KEY, JSON.stringify(progress));
    memory = progress;
  };
  const next = writes.then(task, task);
  writes = next.catch(() => undefined);
  return next;
}
