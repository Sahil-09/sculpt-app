"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, post, saveTokens } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  pro?: boolean;
  units?: string;
}

interface AuthState {
  ready: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  ready: false,
  user: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<{ user: User }>("/v1/auth/me");
      setUser(me.user);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (localStorage.getItem("sculpt.access")) await refreshUser();
      setReady(true);
    })();
  }, [refreshUser]);

  const apply = useCallback((data: { user: User; accessToken: string; refreshToken: string }) => {
    setUser(data.user);
    saveTokens(data.accessToken, data.refreshToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      apply(await post<{ user: User; accessToken: string; refreshToken: string }>("/v1/auth/login", { email, password }));
    },
    [apply]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      apply(
        await post<{ user: User; accessToken: string; refreshToken: string }>("/v1/auth/register", {
          email,
          password,
          name
        })
      );
    },
    [apply]
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ ready, user, login, register, logout, refreshUser }),
    [ready, user, login, register, logout, refreshUser]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
