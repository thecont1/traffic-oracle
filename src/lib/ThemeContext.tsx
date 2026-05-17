import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { THEMES, THEME_CYCLE } from "./theme";
import type { AppTheme, ThemeKey } from "./theme";

const STORAGE_KEY = "traffi-theme";

interface ThemeContextValue {
  theme:        AppTheme;
  themeKey:     ThemeKey;
  nextThemeKey: ThemeKey;
  cycleTheme:   () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: ThemeKey }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    if (initialTheme && THEMES[initialTheme]) return initialTheme;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
      if (saved && THEMES[saved]) return saved;
    } catch { /* ignore */ }
    return "colour";
  });

  const cycleTheme = () => {
    setThemeKey(k => {
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(k) + 1) % THEME_CYCLE.length];
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  const nextThemeKey = THEME_CYCLE[(THEME_CYCLE.indexOf(themeKey) + 1) % THEME_CYCLE.length];

  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeKey], themeKey, nextThemeKey, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
