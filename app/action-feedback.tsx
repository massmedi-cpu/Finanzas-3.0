"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ActionFeedbackState = "pending" | "success" | "error";

type ActionFeedbackItem = {
  id: string;
  state: ActionFeedbackState;
  message: string;
};

type FailureMessage = string | ((error: unknown) => string);

type RunMessages = {
  pending: string;
  success: string;
  error: FailureMessage;
};

type ActionFeedbackValue = {
  begin: (id: string, message: string) => void;
  success: (id: string, message: string) => void;
  error: (id: string, message: string) => void;
  dismiss: (id: string) => void;
  run: <T>(id: string, messages: RunMessages, operation: () => Promise<T>) => Promise<T>;
};

const ActionFeedbackContext = createContext<ActionFeedbackValue | null>(null);
const SUCCESS_VISIBLE_MS = 5_000;

function normalizedMessage(message: string, fallback: string) {
  const value = message.trim();
  return value || fallback;
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ActionFeedbackItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, [clearTimer]);

  const publish = useCallback((id: string, state: ActionFeedbackState, message: string) => {
    clearTimer(id);
    const normalizedId = normalizedMessage(id, "action");
    const normalized = normalizedMessage(
      message,
      state === "pending" ? "Operación en curso…" : state === "success" ? "Operación completada." : "La operación no se ha completado.",
    );

    setItems((current) => {
      const withoutSameAction = current.filter((item) => item.id !== normalizedId);
      return [...withoutSameAction, { id: normalizedId, state, message: normalized }].slice(-3);
    });

    if (state === "success") {
      const timer = window.setTimeout(() => dismiss(normalizedId), SUCCESS_VISIBLE_MS);
      timers.current.set(normalizedId, timer);
    }
  }, [clearTimer, dismiss]);

  const begin = useCallback((id: string, message: string) => publish(id, "pending", message), [publish]);
  const success = useCallback((id: string, message: string) => publish(id, "success", message), [publish]);
  const error = useCallback((id: string, message: string) => publish(id, "error", message), [publish]);

  const run = useCallback(async <T,>(id: string, messages: RunMessages, operation: () => Promise<T>) => {
    begin(id, messages.pending);
    try {
      const result = await operation();
      success(id, messages.success);
      return result;
    } catch (caught) {
      const message = typeof messages.error === "function" ? messages.error(caught) : messages.error;
      error(id, message);
      throw caught;
    }
  }, [begin, error, success]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const value = useMemo<ActionFeedbackValue>(() => ({ begin, dismiss, error, run, success }), [begin, dismiss, error, run, success]);

  return (
    <ActionFeedbackContext.Provider value={value}>
      {children}
      <div className="action-feedback-stack" role="region" aria-label="Estado de las acciones" data-testid="action-feedback-region">
        {items.map((item) => (
          <div
            key={item.id}
            className={`action-feedback action-feedback--${item.state}`}
            data-action-id={item.id}
            data-state={item.state}
            role={item.state === "error" ? "alert" : "status"}
            aria-live={item.state === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <span className="action-feedback__icon" aria-hidden="true">
              {item.state === "pending" ? <i className="action-feedback__spinner" /> : item.state === "success" ? "✓" : "!"}
            </span>
            <span className="action-feedback__message">{item.message}</span>
            {item.state !== "pending" ? (
              <button type="button" className="action-feedback__close" onClick={() => dismiss(item.id)} aria-label="Cerrar aviso">×</button>
            ) : null}
          </div>
        ))}
      </div>
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  const value = useContext(ActionFeedbackContext);
  if (!value) throw new Error("useActionFeedback must be used within ActionFeedbackProvider");
  return value;
}
