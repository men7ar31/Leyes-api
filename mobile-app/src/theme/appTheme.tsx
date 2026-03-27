import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { colors as baseColors } from "../constants/theme";

const APP_THEME_MODE_KEY = "saij_theme_mode_v1";

const LIGHT_THEME_COLORS = {
  ...baseColors,
};

const DARK_THEME_COLORS = {
  background: "#0B1220",
  card: "#0F172A",
  text: "#E5E7EB",
  muted: "#94A3B8",
  primary: "#60A5FA",
  primaryStrong: "#3B82F6",
  border: "#1E293B",
  badgeBg: "#1E3A8A",
  badgeText: "#DBEAFE",
  danger: "#F87171",
};

export type AppThemeColors = typeof LIGHT_THEME_COLORS;

type AppThemeContextValue = {
  isDarkMode: boolean;
  colors: AppThemeColors;
  toggleThemeMode: () => void;
  setThemeMode: (mode: "light" | "dark") => void;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  isDarkMode: false,
  colors: LIGHT_THEME_COLORS,
  toggleThemeMode: () => {},
  setThemeMode: () => {},
});

type AppThemeProviderProps = {
  children: ReactNode;
};

export const AppThemeProvider = ({ children }: AppThemeProviderProps) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadThemeMode = async () => {
      try {
        const raw = await AsyncStorage.getItem(APP_THEME_MODE_KEY);
        if (cancelled) return;
        setIsDarkMode(raw === "dark");
      } catch {
        if (!cancelled) setIsDarkMode(false);
      }
    };
    loadThemeMode();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeMode = (mode: "light" | "dark") => {
    const nextIsDark = mode === "dark";
    setIsDarkMode(nextIsDark);
    AsyncStorage.setItem(APP_THEME_MODE_KEY, nextIsDark ? "dark" : "light").catch(() => {
      // ignore persistence failures
    });
  };

  const toggleThemeMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      AsyncStorage.setItem(APP_THEME_MODE_KEY, next ? "dark" : "light").catch(() => {
        // ignore persistence failures
      });
      return next;
    });
  };

  const value = useMemo<AppThemeContextValue>(
    () => ({
      isDarkMode,
      colors: isDarkMode ? DARK_THEME_COLORS : LIGHT_THEME_COLORS,
      toggleThemeMode,
      setThemeMode,
    }),
    [isDarkMode]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export const useAppTheme = () => useContext(AppThemeContext);
