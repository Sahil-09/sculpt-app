import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const BASE =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://10.0.2.2:4000";

/** Resolve a relative API media path (e.g. `/v1/exercise-media/...`) to a full URL. */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** When set, every call is served from on-device SQLite instead of the server. */
export const LOCAL_FIRST =
  (Constants.expoConfig?.extra as { localFirst?: boolean } | undefined)?.localFirst === true;

const ACCESS_KEY = "sculpt.access";
const REFRESH_KEY = "sculpt.refresh";

// SecureStore throws on web; fall back to memory.
const mem = new Map<string, string>();
async function getItem(k: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(k);
  } catch {
    return mem.get(k) ?? null;
  }
}
async function setItem(k: string, v: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(k, v);
  } catch {
    mem.set(k, v);
  }
}
async function delItem(k: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(k);
  } catch {
    mem.delete(k);
  }
}

export async function getAccess(): Promise<string | null> {
  return getItem(ACCESS_KEY);
}
export async function saveTokens(access: string, refresh: string): Promise<void> {
  await setItem(ACCESS_KEY, access);
  await setItem(REFRESH_KEY, refresh);
}
export async function clearTokens(): Promise<void> {
  await delItem(ACCESS_KEY);
  await delItem(REFRESH_KEY);
}

async function refreshAccess(): Promise<string | null> {
  const refresh = await getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const r = await fetch(`${BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh })
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { accessToken: string; refreshToken: string };
    await saveTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  // Static import is avoided so `localApi` never loads (and opens SQLite) unless it is used.
  if (LOCAL_FIRST) {
    const { localApi } = await import("./local");
    const method = (init.method ?? "GET").toUpperCase();
    const raw = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    return localApi<T>(method, path, raw);
  }
  const token = await getAccess();
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (r.status === 401 && retry) {
    const next = await refreshAccess();
    if (next) return api<T>(path, init, false);
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const body = (await r.json()) as { error?: unknown };
      if (typeof body.error === "string") msg = body.error;
    } catch {
      /* keep default */
    }
    throw new ApiError(r.status, msg);
  }
  return (await r.json()) as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const get = <T>(path: string) => api<T>(path);
