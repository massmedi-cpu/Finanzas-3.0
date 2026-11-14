"use client";

import { synchronizeOfficialSource, verifyPersistedSourceSyncReceipt } from "../src/application/source-sync-client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type BudgetFocus = "all" | "attention";
export type HomeDestination = "/" | "/analysis" | "/forecast";

type ProductPreferences = {
  budgetFocus: BudgetFocus;
  syncOnOpen: boolean;
  privacyOnBlur: boolean;
  homeDestination: HomeDestination;
};

type ProductPreferencesValue = ProductPreferences & {
  ready: boolean;
  privacyActive: boolean;
  lastAutomaticSyncAt: string | null;
  persistenceUnavailable: boolean;
  automaticSyncWarning: string | null;
  setBudgetFocus: (value: BudgetFocus) => void;
  setSyncOnOpen: (value: boolean) => void;
  setPrivacyOnBlur: (value: boolean) => void;
  setHomeDestination: (value: HomeDestination) => void;
  reset: () => void;
};

const STORAGE_KEY = "financial-app:product-preferences-v1";
const SESSION_SYNC_KEY = "financial-app:auto-sync-attempted-v1";
const DEFAULTS: ProductPreferences = {
  budgetFocus: "all",
  syncOnOpen: false,
  privacyOnBlur: true,
  homeDestination: "/",
};

const ProductPreferencesContext = createContext<ProductPreferencesValue | null>(null);

function readStoredPreferences(): ProductPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProductPreferences> | null;
    if (!parsed) return DEFAULTS;
    return {
      budgetFocus: parsed.budgetFocus === "attention" ? "attention" : "all",
      syncOnOpen: typeof parsed.syncOnOpen === "boolean" ? parsed.syncOnOpen : DEFAULTS.syncOnOpen,
      privacyOnBlur: typeof parsed.privacyOnBlur === "boolean" ? parsed.privacyOnBlur : DEFAULTS.privacyOnBlur,
      homeDestination: parsed.homeDestination === "/analysis" || parsed.homeDestination === "/forecast"
        ? parsed.homeDestination
        : "/",
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
  const [persistenceUnavailable, setPersistenceUnavailable] = useState(false);
  const [automaticSyncWarning, setAutomaticSyncWarning] = useState<string | null>(null);
  const syncTriggered = useRef(false);
  // A user enabling the preference must not start a bank import in that same visit.
  // Only the value already stored when the provider mounts is eligible at startup.
  const syncEnabledAtSessionOpen = useRef(false);

  useEffect(() => {
    const initiallyStored = readStoredPreferences();
    syncEnabledAtSessionOpen.current = initiallyStored.syncOnOpen;
    setPreferences(initiallyStored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      setPersistenceUnavailable(false);
    } catch {
      // No afirmar que la configuración se guardó: se perderá al recargar.
      setPersistenceUnavailable(true);
    }
    document.documentElement.dataset.privacyOnBlur = preferences.privacyOnBlur ? "true" : "false";
    document.documentElement.dataset.budgetFocus = preferences.budgetFocus;
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
    if (!ready || !syncEnabledAtSessionOpen.current || !preferences.syncOnOpen || syncTriggered.current) return;
    // Sin marcador de sesión fiable, una recarga podría repetir una importación
    // cuyo resultado anterior todavía no se haya podido verificar.
    try {
      if (window.sessionStorage.getItem(SESSION_SYNC_KEY) === "true") return;
      window.sessionStorage.setItem(SESSION_SYNC_KEY, "true");
    } catch {
      setAutomaticSyncWarning("El navegador no permite recordar esta actualización. No se ha iniciado ninguna sincronización automática para evitar repeticiones.");
      return;
    }
    syncTriggered.current = true;
    setAutomaticSyncWarning(null);
    void synchronizeOfficialSource()
      .then(async (receipt) => {
        const verified = await verifyPersistedSourceSyncReceipt(receipt);
        if (!verified) {
          setLastAutomaticSyncAt(null);
          setAutomaticSyncWarning("La actualización automática respondió, pero el lote persistido no se ha podido comprobar. Puede haberse guardado; consulta el estado de la fuente antes de reintentar.");
          return;
        }
        setLastAutomaticSyncAt(new Date().toISOString());
        setAutomaticSyncWarning(null);
      })
      .catch(() => {
        // Un fallo de red podría llegar después de que se guardara un lote.
        // No reintentar automáticamente ni indicar que la fuente está actualizada.
        setAutomaticSyncWarning("No se ha podido confirmar la actualización automática. Comprueba el estado de la fuente antes de volver a intentarlo.");
      });
  }, [preferences.syncOnOpen, ready]);

  const value = useMemo<ProductPreferencesValue>(() => ({
    ...preferences,
    ready,
    privacyActive,
    lastAutomaticSyncAt,
    persistenceUnavailable,
    automaticSyncWarning,
    setBudgetFocus: (budgetFocus) => setPreferences((current) => ({ ...current, budgetFocus })),
    setSyncOnOpen: (syncOnOpen) => setPreferences((current) => ({ ...current, syncOnOpen })),
    setPrivacyOnBlur: (privacyOnBlur) => setPreferences((current) => ({ ...current, privacyOnBlur })),
    setHomeDestination: (homeDestination) => setPreferences((current) => ({ ...current, homeDestination })),
    reset: () => setPreferences(DEFAULTS),
  }), [preferences, ready, privacyActive, lastAutomaticSyncAt, persistenceUnavailable, automaticSyncWarning]);

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
