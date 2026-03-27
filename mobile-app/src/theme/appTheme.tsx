import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { colors as baseColors } from "../constants/theme";

const APP_THEME_MODE_KEY = "saij_theme_mode_v1";

const LIGHT_THEME_COLORS = {
  ...baseColors,
  primary: "#1b375e",
  primaryStrong: "#1b375e",
  primarySoft: "#E9EFF7",
  primarySoftPressed: "#DCE7F5",
  background: "#F4F7FB",
  card: "#FFFFFF",
  surface: "#F8FAFD",
  border: "#E4EAF2",
  text: "#141A23",
  muted: "#6D7788",
  badgeBg: "#EEF3FA",
  badgeText: "#1b375e",
  iconDefault: "#4B5F7D",
  success: "#1F7A4A",
  successSoft: "#EAF7F0",
  danger: "#B24747",
  white: "#FFFFFF",
  neuLight: "#FFFFFF",
  neuDark: "#DCE4F0",
};

const DARK_THEME_COLORS = {
  primary: "#8FA8D3",
  primaryStrong: "#C1D4F5",
  primarySoft: "#23344E",
  primarySoftPressed: "#2B4262",
  background: "#111722",
  card: "#192233",
  surface: "#222F44",
  border: "#2D3B54",
  text: "#E8EEF7",
  muted: "#A3B1C6",
  badgeBg: "#2A3D5F",
  badgeText: "#CFE0FF",
  iconDefault: "#B0C2DE",
  success: "#7DD39A",
  successSoft: "#1C3A2D",
  danger: "#E39A9A",
  white: "#FFFFFF",
  neuLight: "#26344D",
  neuDark: "#0F1622",
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
