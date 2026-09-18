"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : date.format(parsed).replace(".", "");
}

export default function GlobalSearch() {
  const pathname = usePathname();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
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
    setOpen(false);
    setQuery("");
    setItems([]);
    setActiveIndex(-1);
  }, [pathname]);

  useEffect(() => {
    requestRef.current?.abort();
    setActiveIndex(-1);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setLoading(false);
      setPartial(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as SearchResponse | null;
          if (!response.ok || !payload || !Array.isArray(payload.items)) throw new Error("search_failed");
          if (controller.signal.aborted) return;
          setItems(payload.items);
          setPartial(payload.partial === true);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          if (!controller.signal.aborted) {
            setItems([]);
            setPartial(false);
            setError(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function close() {
    requestRef.current?.abort();
    setOpen(false);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => items.length ? Math.min(items.length - 1, current + 1) : -1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => items.length ? Math.max(0, current - 1) : -1);
    } else if (event.key === "Enter" && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      window.location.assign(items[activeIndex].href);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Buscar en Financial App">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
        <span>Buscar</span><kbd>/</kbd>
      </button>
      {open && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`}>
            <div className={styles.topline}>
              <div><span>BUSCADOR GLOBAL</span><strong id={`${inputId}-title`}>Encuentra cualquier cosa</strong></div>
              <button type="button" onClick={close} aria-label="Cerrar buscador">Esc</button>
            </div>
            <label className={styles.searchBox} htmlFor={inputId}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
              <input
                ref={inputRef}
                id={inputId}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Comercio, factura, categoría, movimiento…"
                autoComplete="off"
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls={`${inputId}-results`}
                aria-activedescendant={activeIndex >= 0 ? `${inputId}-result-${activeIndex}` : undefined}
              />
              {loading && <span className={styles.loading} role="status">Buscando…</span>}
            </label>
            <div id={`${inputId}-results`} className={styles.results} role="listbox" aria-label="Resultados de búsqueda">
              {query.trim().length < 2 ? (
                <div className={styles.hint}><strong>Busca en toda la app</strong><span>Prueba con un comercio, una factura, una categoría o el nombre de una sección.</span></div>
              ) : error ? (
                <div className={styles.hint}><strong>No se pudo completar la búsqueda</strong><span>Los datos no se han modificado. Puedes intentarlo de nuevo.</span></div>
              ) : !loading && items.length === 0 ? (
                <div className={styles.hint}><strong>Sin coincidencias</strong><span>No hay resultados para “{query.trim()}”.</span></div>
              ) : (
                items.map((item, index) => {
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
                      onClick={close}
                    >
                      <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
                      <span className={styles.copy}><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>
                      <span className={styles.meta}>{typeof item.amountCents === "number" ? <b>{money.format(item.amountCents / 100)}</b> : null}{itemDate && <small>{itemDate}</small>}</span>
                    </Link>
                  );
                })
              )}
            </div>
            <div className={styles.footer}>
              <span>↑↓ navegar · Enter abrir · Esc cerrar</span>
              {partial && <span>Alguna fuente no respondió; se muestran los resultados disponibles.</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
