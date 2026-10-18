import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { Dark, Light, getA, type Theme } from "./theme";

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  A: ReturnType<typeof getA>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync("theme").then((val) => {
      if (val) setIsDark(val === "dark");
    });
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    SecureStore.setItemAsync("theme", next ? "dark" : "light");
  };

  const theme = isDark ? Dark : Light;
  const A = getA(isDark);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, A }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
