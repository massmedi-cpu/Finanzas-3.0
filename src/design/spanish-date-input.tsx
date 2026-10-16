"use client";

import { useId, type ChangeEventHandler, type InputHTMLAttributes, type Ref } from "react";
import { formatDate } from "../core/formatters";
import { ProductIcon } from "./product-icons";
import styles from "./spanish-date-input.module.css";

type SpanishDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
};

// The native date control owns ISO values, constraints, keyboard editing and its
// platform picker. Its visible text depends on the browser locale, so the app
// renders the selected date in Spanish independently of browser settings.
export function SpanishDateInput({ label, value, onChange, inputRef, "aria-describedby": describedBy, className, ...props }: SpanishDateInputProps) {
  const displayId = useId();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
  const display = date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? formatDate(date)
    : "dd/mm/aaaa";

  return (
    <div className={styles.dateControl}>
      <output id={displayId} className={value ? styles.value : styles.placeholder} aria-live="polite">{display}</output>
      <ProductIcon name="calendar" className={styles.calendarIcon} />
      <input
        {...props}
        ref={inputRef}
        className={`${styles.nativeInput}${className ? ` ${className}` : ""}`}
        type="date"
        value={value}
        aria-label={label}
        aria-describedby={[displayId, describedBy].filter(Boolean).join(" ")}
        onChange={onChange}
        onClick={(event) => {
          try { event.currentTarget.showPicker?.(); } catch { /* Native picker remains available. */ }
          props.onClick?.(event);
        }}
      />
    </div>
  );
}
