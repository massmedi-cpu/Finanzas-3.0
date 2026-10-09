"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatMoneyCents } from "../src/core/money";
import { ProductIcon } from "../src/design/product-icons";
import { MAX_GLOBAL_SEARCH_QUERY_LENGTH, moveGlobalSearchIndex, prepareGlobalSearchQuery } from "./global-search-policy";
import { shouldOpenGlobalSearchShortcut } from "./global-search-shortcut";
import styles from "./global-search.module.css";

type SearchKind = "transaction" | "document" | "merchant" | "category" | "account" | "section";
type SearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  href: string;
  amountCents?: number | null;
  date?: string | null;
};
type SearchResponse = { query: string; items: SearchItem[]; partial: boolean };

const KIND_LABEL: Record<SearchKind, string> = {
  transaction: "Movimiento",
  document: "Documento",
  merchant: "Comercio",
  category: "Categoría",
  account: "Cuenta",
  section: "Sección",
};
const date = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
const SEARCH_TIMEOUT_MS = 12_000;
const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function formatDate(value: string | null | undefined) {
  const bankDate = value?.slice(0, 10);
  if (!bankDate || !/^\d{4}-\d{2}-\d{2}$/.test(bankDate)) return null;
  const parsed = new Date(`${bankDate}T12:00:00Z`);
  // JavaScript normaliza fechas inexistentes: nunca mostrar 30/02 como una fecha bancaria real.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== bankDate) return null;
  return date.format(parsed).replace(".", "");
}

export default function GlobalSearch() {
  const pathname = usePathname();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState(false);
  const [requestTimedOut, setRequestTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  function openSearch() {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }

  function close(restoreFocus = true) {
    requestSequenceRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    setQuery("");
    setItems([]);
    setResultsQuery("");
    setLoading(false);
    setPartial(false);
    setError(false);
    setRequestTimedOut(false);
    setActiveIndex(-1);
    const opener = openerRef.current;
    openerRef.current = null;
    if (restoreFocus && opener?.isConnected) {
      window.setTimeout(() => opener.focus(), 0);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (shouldOpenGlobalSearchShortcut({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        targetTagName: target?.tagName ?? null,
        targetContentEditable: target?.isContentEditable ?? false,
      })) {
        event.preventDefault();
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    openerRef.current = null;
    setOpen(false);
    setQuery("");
    setItems([]);
    setResultsQuery("");
    setLoading(false);
    setPartial(false);
    setError(false);
    setRequestTimedOut(false);
    setActiveIndex(-1);
  }, [pathname]);

  useEffect(() => {
    requestRef.current?.abort();
    const requestSequence = ++requestSequenceRef.current;
    setActiveIndex(-1);
    const preparedQuery = prepareGlobalSearchQuery(query);
    if (!preparedQuery) {
      setItems([]);
      setResultsQuery("");
      setLoading(false);
      setPartial(false);
      setError(false);
      setRequestTimedOut(false);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(false);
    setRequestTimedOut(false);
    // La respuesta queda vinculada al término exacto, incluso antes del siguiente efecto React.
    setItems([]);
    setResultsQuery("");
    setPartial(false);
    const timer = window.setTimeout(() => {
      let deadlineExceeded = false;
      const deadline = window.setTimeout(() => {
        deadlineExceeded = true;
        controller.abort();
      }, SEARCH_TIMEOUT_MS);
      void fetch(`/api/search?q=${encodeURIComponent(preparedQuery)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as SearchResponse | null;
          if (!response.ok || !payload || !Array.isArray(payload.items) || payload.query !== preparedQuery) throw new Error("search_failed");
          if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return;
          setItems(payload.items);
          setResultsQuery(preparedQuery);
          setPartial(payload.partial === true);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError" && !deadlineExceeded) return;
          if ((!controller.signal.aborted || deadlineExceeded) && requestSequence === requestSequenceRef.current) {
            setItems([]);
            setResultsQuery("");
            setPartial(false);
            setError(true);
            setRequestTimedOut(deadlineExceeded);
          }
        })
        .finally(() => {
          window.clearTimeout(deadline);
          if ((!controller.signal.aborted || deadlineExceeded) && requestSequence === requestSequenceRef.current) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryCount]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${inputId}-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, inputId]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const safeItems = !loading && !error && prepareGlobalSearchQuery(query) === resultsQuery ? items : [];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => moveGlobalSearchIndex(current, safeItems.length, "next"));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => moveGlobalSearchIndex(current, safeItems.length, "previous"));
    } else if (event.key === "Enter" && activeIndex >= 0 && safeItems[activeIndex]) {
      event.preventDefault();
      requestSequenceRef.current += 1;
      requestRef.current?.abort();
      window.location.assign(safeItems[activeIndex].href);
    }
  }

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const preparedQuery = prepareGlobalSearchQuery(query);
  const queryMatchesResults = preparedQuery === resultsQuery;
  const searching = loading || Boolean(preparedQuery && !queryMatchesResults && !error);
  const visibleItems = !searching && !error && queryMatchesResults ? items : [];
  const hasResults = visibleItems.length > 0;
  const previewMovements = visibleItems.filter((item) => item.kind === "transaction").length;
  const fullMovementHref = preparedQuery ? `/transactions?q=${encodeURIComponent(preparedQuery)}` : "/transactions";
  const statusMessage = searching
    ? "Buscando resultados…"
    : error
      ? requestTimedOut ? "La búsqueda ha superado el tiempo de espera. Puedes reintentarla." : "No se pudo completar la búsqueda."
      : preparedQuery
        ? `Resultados rápidos: ${visibleItems.length} mostrados (${previewMovements} movimientos). No es el total de coincidencias.${partial ? " Algunos orígenes no respondieron." : ""}`
        : "Escribe al menos dos caracteres para buscar.";

  return (
    <>
      <button type="button" className={styles.trigger} onClick={openSearch} aria-label="Buscar en Financial App">
        <ProductIcon name="search" />
        <span>Buscar</span><kbd>/</kbd>
      </button>
      {open && createPortal(
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} onKeyDown={onDialogKeyDown}>
            <div className={styles.topline}>
              <div><span>BUSCADOR GLOBAL</span><strong id={`${inputId}-title`}>Encuentra cualquier cosa</strong></div>
              <button type="button" onClick={() => close()} aria-label="Cerrar buscador">Esc</button>
            </div>
            <label className={styles.searchBox} htmlFor={inputId}>
              <ProductIcon name="search" />
              <input
                ref={inputRef}
                id={inputId}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Comercio, factura, categoría, movimiento…"
                autoComplete="off"
                maxLength={MAX_GLOBAL_SEARCH_QUERY_LENGTH}
                role="combobox"
                aria-label="Buscar en Financial App"
                aria-expanded={hasResults}
                aria-autocomplete="list"
                aria-controls={hasResults ? `${inputId}-results` : undefined}
                aria-describedby={`${inputId}-status`}
                aria-activedescendant={hasResults && activeIndex >= 0 ? `${inputId}-result-${activeIndex}` : undefined}
              />
              {searching && <span className={styles.loading} aria-hidden="true">Buscando…</span>}
            </label>
            <p id={`${inputId}-status`} className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
            {preparedQuery && !searching && !error ? (
              <p className={styles.previewSummary}>Resultados rápidos · {visibleItems.length} mostrados ({previewMovements} movimientos). No es el total de coincidencias.</p>
            ) : null}
            <div id={`${inputId}-results`} className={styles.results} role={hasResults ? "listbox" : "region"} aria-label="Resultados de búsqueda">
              {!preparedQuery ? (
                <div className={styles.hint}><strong>Busca en toda la app</strong><span>Prueba con un comercio, una factura, una categoría o el nombre de una sección.</span></div>
              ) : searching ? (
                <div className={styles.hint}><strong>Buscando coincidencias…</strong><span>Se consultan las fuentes disponibles. Los resultados anteriores se han ocultado para evitar confusiones.</span></div>
              ) : error ? (
                <div className={styles.hint}>
                  <strong>{requestTimedOut ? "La búsqueda tardó demasiado" : "No se pudo completar la búsqueda"}</strong>
                  <span>{requestTimedOut ? "El servidor no respondió en 12 segundos. Puedes reintentar sin modificar datos." : "No se ha modificado ningún dato. Puedes repetir la consulta sin volver a escribirla."}</span>
                  <button type="button" className={styles.retryButton} onClick={() => { setRetryCount((current) => current + 1); inputRef.current?.focus(); }}>
                    Reintentar búsqueda
                  </button>
                </div>
              ) : visibleItems.length === 0 ? (
                <div className={styles.hint}><strong>Sin coincidencias</strong><span>No hay resultados para “{preparedQuery}”.</span></div>
              ) : (
                visibleItems.map((item, index) => {
                  const itemDate = formatDate(item.date);
                  return (
                    <Link prefetch={false}
                      id={`${inputId}-result-${index}`}
                      key={item.id}
                      href={item.href}
                      role="option"
                      aria-selected={activeIndex === index}
                      className={`${styles.result}${activeIndex === index ? ` ${styles.active}` : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => close(false)}
                    >
                      <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
                      <span className={styles.copy}><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>
                      <span className={styles.meta}>{typeof item.amountCents === "number" ? <b>{formatMoneyCents(item.amountCents)}</b> : null}{itemDate && <small>{itemDate}</small>}</span>
                    </Link>
                  );
                })
              )}
            </div>
            <div className={styles.footer}>
              <span>↑↓ navegar · Enter abrir · Esc cerrar</span>
              {preparedQuery ? (
                <Link prefetch={false} href={fullMovementHref} onClick={() => close(false)}>
                  Ver todos los movimientos para «{preparedQuery}»
                </Link>
              ) : null}
              {partial && <span>Alguna fuente no respondió; se muestran los resultados disponibles.</span>}
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
