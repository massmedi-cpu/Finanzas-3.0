"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type VisualDensity = "comfortable" | "compact";
export type VisualTheme = "system" | "dark" | "light";
export type ResolvedVisualTheme = "dark" | "light";

type VisualPreferences = {
  density: VisualDensity;
  reduceMotion: boolean;
  theme: VisualTheme;
};

type VisualPreferencesValue = VisualPreferences & {
  ready: boolean;
  resolvedTheme: ResolvedVisualTheme;
  setDensity: (density: VisualDensity) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setTheme: (theme: VisualTheme) => void;
  reset: () => void;
};

const STORAGE_KEY = "financial-app:visual-preferences-v1";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_PREFERENCES: VisualPreferences = {
  density: "comfortable",
  reduceMotion: false,
  theme: "system",
};

const VisualPreferencesContext = createContext<VisualPreferencesValue | null>(null);

function isVisualDensity(value: unknown): value is VisualDensity {
  return value === "comfortable" || value === "compact";
}

function isVisualTheme(value: unknown): value is VisualTheme {
  return value === "system" || value === "dark" || value === "light";
}

function getSystemTheme(): ResolvedVisualTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function resolveTheme(theme: VisualTheme, systemTheme: ResolvedVisualTheme): ResolvedVisualTheme {
  return theme === "system" ? systemTheme : theme;
}

function readStoredPreferences(): VisualPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    const candidate = parsed as Partial<VisualPreferences>;
    return {
      density: isVisualDensity(candidate.density) ? candidate.density : DEFAULT_PREFERENCES.density,
      reduceMotion: typeof candidate.reduceMotion === "boolean" ? candidate.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
      theme: isVisualTheme(candidate.theme) ? candidate.theme : DEFAULT_PREFERENCES.theme,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyPreferences(preferences: VisualPreferences, resolvedTheme: ResolvedVisualTheme) {
  const root = document.documentElement;
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
  root.dataset.themePreference = preferences.theme;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function VisualPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<VisualPreferences>(DEFAULT_PREFERENCES);
  const [systemTheme, setSystemTheme] = useState<ResolvedVisualTheme>("dark");
  const [ready, setReady] = useState(false);
  const resolvedTheme = resolveTheme(preferences.theme, systemTheme);

  useEffect(() => {
    const initialSystemTheme = getSystemTheme();
    const stored = readStoredPreferences();
    setSystemTheme(initialSystemTheme);
    setPreferences(stored);
    applyPreferences(stored, resolveTheme(stored.theme, initialSystemTheme));
    setReady(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyPreferences(preferences, resolvedTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Las preferencias visuales siguen activas durante la sesión aunque el
      // navegador bloquee almacenamiento local.
    }
  }, [preferences, ready, resolvedTheme]);

  const value = useMemo<VisualPreferencesValue>(() => ({
    ...preferences,
    ready,
    resolvedTheme,
    setDensity: (density) => setPreferences((current) => ({ ...current, density })),
    setReduceMotion: (reduceMotion) => setPreferences((current) => ({ ...current, reduceMotion })),
    setTheme: (theme) => setPreferences((current) => ({ ...current, theme })),
    reset: () => setPreferences(DEFAULT_PREFERENCES),
  }), [preferences, ready, resolvedTheme]);

  return <VisualPreferencesContext.Provider value={value}>{children}</VisualPreferencesContext.Provider>;
}

export function useVisualPreferences() {
  const value = useContext(VisualPreferencesContext);
  if (!value) throw new Error("useVisualPreferences must be used within VisualPreferencesProvider");
  return value;
}
