"use client";

import { useId, type ChangeEventHandler, type InputHTMLAttributes } from "react";
import { ProductIcon } from "./product-icons";
import styles from "./spanish-date-input.module.css";

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

type SpanishMonthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
};

export function SpanishMonthInput({ label, value, onChange, "aria-describedby": describedBy, className, ...props }: SpanishMonthInputProps) {
  const displayId = useId();
  const display = /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? monthFormatter.format(new Date(`${value}-15T12:00:00Z`))
    : "mes y año";

  return (
    <div className={styles.dateControl}>
      <span id={displayId} className={value ? styles.value : styles.placeholder} aria-live="polite">{display}</span>
      <ProductIcon name="calendar" className={styles.calendarIcon} />
      <input
        {...props}
        className={`${styles.nativeInput}${className ? ` ${className}` : ""}`}
        type="month"
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
