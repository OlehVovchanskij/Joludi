import type { AuthResponse } from "./types";

const AUTH_STORAGE_KEY = "joludi_auth";
const HISTORY_VIEW_KEY = "joludi_history_view";

export function readStoredAuth(): AuthResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  } catch {
    return null;
  }
}

export function saveStoredAuth(value: AuthResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
}

export function getAccessToken(): string | null {
  return readStoredAuth()?.session?.access_token ?? null;
}

export function getRefreshToken(): string | null {
  return readStoredAuth()?.session?.refresh_token ?? null;
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function readHistoryView<T>(): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_VIEW_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveHistoryView(value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HISTORY_VIEW_KEY, JSON.stringify(value));
}

export function clearHistoryView(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(HISTORY_VIEW_KEY);
}
