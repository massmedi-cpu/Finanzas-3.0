"use client";

import { useId, useRef } from "react";
import styles from "./spanish-date-field.module.css";

type SpanishTimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

// The browser locale controls the native time input's visible 12/24-hour
// format. Show the selected value as 24-hour time while retaining its picker.
export function SpanishTimeField({ value, onChange, disabled = false }: SpanishTimeFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const display = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "hh:mm";

  return (
    <div className={styles.field}>
      <label htmlFor={id}>Hora</label>
      <div className={styles.dateControl}>
        <span className={value ? styles.value : styles.placeholder} id={`${id}-display`} aria-live="polite">{display}</span>
        <span className={styles.timeHint} aria-hidden="true">24 h</span>
        <input
          ref={input}
          id={id}
          className={styles.nativeInput}
          type="time"
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-display`}
          onChange={(event) => onChange(event.target.value)}
          onClick={() => {
            try { input.current?.showPicker?.(); } catch { /* Native picker remains available. */ }
          }}
        />
      </div>
    </div>
  );
}
