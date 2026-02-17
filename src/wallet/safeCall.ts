import { toUserSafeError } from "./safeError";

export async function safeCall<T>(
  fn: () => Promise<T>,
  onUserMessage?: (msg: string) => void,
  fallbackMsg = "Something went wrong. Please try again."
): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    const se = toUserSafeError(e, fallbackMsg);

    // never show raw provider error strings
    onUserMessage?.(se.message);

    // log only in dev
    if (import.meta.env.DEV) console.warn("safeCall:", se.code, e);

    return null;
  }
}
