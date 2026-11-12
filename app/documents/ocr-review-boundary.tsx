"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ocr-review.module.css";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class OcrReviewBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Render errors can contain OCR text, private filenames or invoice fields.
    // Report only a stable diagnostic code; never log the raw exception,
    // component stack or user-supplied financial content to the browser.
    console.error("ocr-review-render-error");
  }

  private reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={styles.section} aria-live="polite">
        <div className={styles.error} role="alert">
          La lectura OCR terminó, pero el panel no pudo mostrar el resultado de forma segura. No se ha guardado ningún dato.
        </div>
        <button type="button" onClick={this.reset}>
          Reintentar mostrar el panel
        </button>
      </section>
    );
  }
}
