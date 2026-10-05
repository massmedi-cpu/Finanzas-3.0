"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ProductPreferences = {
  syncOnOpen: boolean;
  privacyOnBlur: boolean;
};

type ProductPreferencesValue = ProductPreferences & {
  ready: boolean;
  privacyActive: boolean;
  lastAutomaticSyncAt: string | null;
  setSyncOnOpen: (value: boolean) => void;
  setPrivacyOnBlur: (value: boolean) => void;
  reset: () => void;
};

const STORAGE_KEY = "financial-app:product-preferences-v1";
const SESSION_SYNC_KEY = "financial-app:auto-sync-attempted-v1";
const DEFAULTS: ProductPreferences = {
  syncOnOpen: false,
  privacyOnBlur: true,
};

const ProductPreferencesContext = createContext<ProductPreferencesValue | null>(null);

function readStoredPreferences(): ProductPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProductPreferences> | null;
    if (!parsed) return DEFAULTS;
    return {
      syncOnOpen: typeof parsed.syncOnOpen === "boolean" ? parsed.syncOnOpen : DEFAULTS.syncOnOpen,
      privacyOnBlur: typeof parsed.privacyOnBlur === "boolean" ? parsed.privacyOnBlur : DEFAULTS.privacyOnBlur,
    };
  } catch {
    return DEFAULTS;
  }
}

export function ProductPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ProductPreferences>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [privacyActive, setPrivacyActive] = useState(false);
  const [lastAutomaticSyncAt, setLastAutomaticSyncAt] = useState<string | null>(null);
  const syncTriggered = useRef(false);

  useEffect(() => {
    setPreferences(readStoredPreferences());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    document.documentElement.dataset.privacyOnBlur = preferences.privacyOnBlur ? "true" : "false";
  }, [preferences, ready]);

  useEffect(() => {
    if (!ready || !preferences.privacyOnBlur) {
      setPrivacyActive(false);
      return;
    }
    const hide = () => setPrivacyActive(true);
    const reveal = () => setPrivacyActive(false);
    const visibility = () => setPrivacyActive(document.visibilityState !== "visible");
    window.addEventListener("blur", hide);
    window.addEventListener("focus", reveal);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", reveal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [preferences.privacyOnBlur, ready]);

  useEffect(() => {
    if (!ready || !preferences.syncOnOpen || syncTriggered.current) return;
    if (window.sessionStorage.getItem(SESSION_SYNC_KEY) === "true") return;
    syncTriggered.current = true;
    window.sessionStorage.setItem(SESSION_SYNC_KEY, "true");
    void fetch("/api/source/google/sync", { method: "POST", cache: "no-store" })
      .then((response) => {
        if (response.ok) setLastAutomaticSyncAt(new Date().toISOString());
      })
      .catch(() => undefined);
  }, [preferences.syncOnOpen, ready]);

  const value = useMemo<ProductPreferencesValue>(() => ({
    ...preferences,
    ready,
    privacyActive,
    lastAutomaticSyncAt,
    setSyncOnOpen: (syncOnOpen) => setPreferences((current) => ({ ...current, syncOnOpen })),
    setPrivacyOnBlur: (privacyOnBlur) => setPreferences((current) => ({ ...current, privacyOnBlur })),
    reset: () => setPreferences(DEFAULTS),
  }), [preferences, ready, privacyActive, lastAutomaticSyncAt]);

  return (
    <ProductPreferencesContext.Provider value={value}>
      {children}
      {privacyActive ? (
        <div className="financial-privacy-shield" role="status" aria-live="polite">
          <strong>Financial App protegida</strong>
          <span>Los datos se muestran de nuevo al volver a esta ventana.</span>
        </div>
      ) : null}
    </ProductPreferencesContext.Provider>
  );
}

export function useProductPreferences() {
  const value = useContext(ProductPreferencesContext);
  if (!value) throw new Error("useProductPreferences must be used within ProductPreferencesProvider");
  return value;
}
