"use client";

import { useId, useRef } from "react";
import { formatDate } from "../../src/core/formatters";
import { ProductIcon } from "../../src/design/product-icons";
import styles from "./spanish-date-field.module.css";

type SpanishDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

// The browser, not <html lang>, controls the visible order of a native date
// input. Keep its ISO value and platform picker, but show the financial date
// in the application's own locale regardless of browser settings.
export function SpanishDateField({ value, onChange, disabled = false }: SpanishDateFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const display = value ? formatDate(`${value}T12:00:00Z`) : "dd/mm/aaaa";

  return (
    <div className={styles.field}>
      <label htmlFor={id}>Fecha</label>
      <div className={styles.controls}>
        <div className={styles.dateControl}>
          <output className={value ? styles.value : styles.placeholder} id={`${id}-display`} aria-live="polite">{display}</output>
          <ProductIcon name="calendar" className={styles.calendarIcon} />
          <input
            ref={input}
            id={id}
            className={styles.nativeInput}
            type="date"
            value={value}
            disabled={disabled}
            aria-describedby={`${id}-display`}
            onChange={(event) => onChange(event.target.value)}
            onClick={() => {
              try { input.current?.showPicker?.(); } catch { /* Native picker remains available. */ }
            }}
          />
        </div>
        {value ? (
          <button className={styles.clear} type="button" disabled={disabled} title="Quitar fecha" aria-label="Quitar fecha" onClick={() => onChange("")}><ProductIcon name="close" /></button>
        ) : null}
      </div>
    </div>
  );
}
