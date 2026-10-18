import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, clearTokens, getAccess, post, saveTokens } from "./api";

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
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  ready: false,
  user: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccess();
      if (token) {
        try {
          const me = await api<{ user: User }>("/v1/auth/me");
          setUser(me.user);
        } catch {
          await clearTokens();
        }
      }
      setReady(true);
    })();
  }, []);

  const apply = useCallback((data: { user: User; accessToken: string; refreshToken: string }) => {
    setUser(data.user);
    return saveTokens(data.accessToken, data.refreshToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await post<{ user: User; accessToken: string; refreshToken: string }>(
        "/v1/auth/login",
        { email, password }
      );
      await apply(data);
    },
    [apply]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const data = await post<{ user: User; accessToken: string; refreshToken: string }>(
        "/v1/auth/register",
        { email, password, name }
      );
      await apply(data);
    },
    [apply]
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ ready, user, login, register, logout }), [ready, user, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
