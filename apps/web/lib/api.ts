"use client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access: localStorage.getItem("sculpt.access"),
    refresh: localStorage.getItem("sculpt.refresh")
  };
}

export function saveTokens(access: string, refresh: string): void {
  localStorage.setItem("sculpt.access", access);
  localStorage.setItem("sculpt.refresh", refresh);
}

export function clearTokens(): void {
  localStorage.removeItem("sculpt.access");
  localStorage.removeItem("sculpt.refresh");
}

async function refreshAccess(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;
  try {
    const r = await fetch(`${BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh })
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { accessToken: string; refreshToken: string };
    saveTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { access } = getTokens();
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
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

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
