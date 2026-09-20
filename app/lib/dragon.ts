import { useSyncExternalStore } from "react";
import type { DragonApi, Platform } from "@/shared/api";

declare global {
  interface Window {
    dragon?: DragonApi;
  }
}

/** True when running inside the Electron shell (as opposed to a plain browser tab in dev). */
export function hasDragon(): boolean {
  return typeof window !== "undefined" && Boolean(window.dragon);
}

export function dragon(): DragonApi {
  if (!window.dragon) {
    throw new Error("This page only works inside the Dragon desktop app.");
  }
  return window.dragon;
}

// `window.dragon` never changes after load, so nothing to subscribe to.
const never = () => () => {};

/**
 * The static export is rendered once for every platform, so anything that
 * depends on it is unknown (null) until the page hydrates in the real window.
 */
export function usePlatform(): Platform | null {
  return useSyncExternalStore(never, () => window.dragon?.platform ?? null, () => null);
}

/** null while unknown (server render), then whether the preload API is present. */
export function useInElectron(): boolean | null {
  return useSyncExternalStore(never, hasDragon, () => null);
}
