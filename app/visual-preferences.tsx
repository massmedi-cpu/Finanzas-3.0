"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type VisualDensity = "comfortable" | "compact";

type VisualPreferences = {
  density: VisualDensity;
  reduceMotion: boolean;
};

type VisualPreferencesValue = VisualPreferences & {
  setDensity: (density: VisualDensity) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  reset: () => void;
};

const STORAGE_KEY = "financial-app:visual-preferences-v1";
const DEFAULT_PREFERENCES: VisualPreferences = {
  density: "comfortable",
  reduceMotion: false,
};

const VisualPreferencesContext = createContext<VisualPreferencesValue | null>(null);

function isVisualDensity(value: unknown): value is VisualDensity {
  return value === "comfortable" || value === "compact";
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
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyPreferences(preferences: VisualPreferences) {
  const root = document.documentElement;
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
  root.dataset.visualPreferencesReady = "true";
}

export function VisualPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<VisualPreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredPreferences();
    setPreferences(stored);
    applyPreferences(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyPreferences(preferences);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Las preferencias visuales siguen activas durante la sesión aunque el
      // navegador bloquee almacenamiento local.
    }
  }, [hydrated, preferences]);

  const value = useMemo<VisualPreferencesValue>(() => ({
    ...preferences,
    setDensity: (density) => setPreferences((current) => ({ ...current, density })),
    setReduceMotion: (reduceMotion) => setPreferences((current) => ({ ...current, reduceMotion })),
    reset: () => setPreferences(DEFAULT_PREFERENCES),
  }), [preferences]);

  return <VisualPreferencesContext.Provider value={value}>{children}</VisualPreferencesContext.Provider>;
}

export function useVisualPreferences() {
  const value = useContext(VisualPreferencesContext);
  if (!value) throw new Error("useVisualPreferences must be used within VisualPreferencesProvider");
  return value;
}
