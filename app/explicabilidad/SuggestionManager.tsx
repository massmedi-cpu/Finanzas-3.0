'use client';

import { useState } from 'react';
import type { RuleSuggestion } from '../../src/private-data/explainability';

interface PreviewState {
  suggestionId: string;
  matched: number;
  wouldChange: number;
  manualProtected: number;
}

export default function SuggestionManager({ initialSuggestions }: { initialSuggestions: RuleSuggestion[] }) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  function rulePayload(suggestion: RuleSuggestion) {
    return {
      name: `${suggestion.merchant} → ${suggestion.targetCategory}`,
      active: true,
      priority: 100,
      matchField: suggestion.matchField,
      matchMode: suggestion.matchMode,
      matchText: suggestion.matchText,
      accountKey: null,
      direction: suggestion.direction,
      targetCategory: suggestion.targetCategory,
      targetSubcategory: suggestion.targetSubcategory,
      targetMerchant: suggestion.targetMerchant,
      notes: `Sugerida por V2.7 con ${suggestion.confidence}% de consistencia sobre ${suggestion.matched} movimientos.`,
    };
  }

  async function previewSuggestion(suggestion: RuleSuggestion) {
    setBusyId(suggestion.id);
    setError('');
    try {
      const response = await fetch('/api/private/rule-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rulePayload(suggestion)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'preview-failed');
      setPreview({ suggestionId: suggestion.id, matched: Number(body.matched) || 0, wouldChange: Number(body.wouldChange) || 0, manualProtected: Number(body.manualProtected) || 0 });
    } catch {
      setPreview(null);
      setError('No se ha podido validar esta sugerencia. No se aplicará nada.');
    } finally {
      setBusyId(null);
    }
  }

  async function createRule(suggestion: RuleSuggestion) {
    if (preview?.suggestionId !== suggestion.id) return;
    setBusyId(suggestion.id);
    setError('');
    try {
      const response = await fetch('/api/private/rule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rulePayload(suggestion)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.rule) throw new Error(body.error || 'rule-save-failed');
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      setPreview(null);
    } catch {
      setError('No se ha podido crear la regla. Tus movimientos permanecen intactos.');
    } finally {
      setBusyId(null);
    }
  }

  if (suggestions.length === 0) return <div className="empty compact-empty">No hay patrones suficientemente consistentes sin automatizar. Eso es una buena señal.</div>;

  return <div className="suggestion-list">
    {error && <div className="form-error" role="alert">{error}</div>}
    {suggestions.map((suggestion) => {
      const validated = preview?.suggestionId === suggestion.id;
      return <article className="suggestion-card" key={suggestion.id}>
        <div className="suggestion-main">
          <div><strong>{suggestion.merchant}</strong><p>{suggestion.matched.toLocaleString('es-ES')} movimientos · {suggestion.confidence}% consistencia · {suggestion.direction === 'expense' ? 'gastos' : suggestion.direction === 'income' ? 'ingresos' : 'ingresos y gastos'}</p></div>
          <span className="badge">{suggestion.targetCategory}{suggestion.targetSubcategory ? ` · ${suggestion.targetSubcategory}` : ''}</span>
        </div>
        <div className="suggestion-samples">{suggestion.samples.slice(0, 3).map((sample) => <span key={sample.sourceId}>{sample.date} · {Number(sample.amount).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>)}</div>
        {validated && <div className="suggestion-preview"><span>{preview.matched} coincidencias</span><span>{preview.wouldChange} cambiarían</span><span>{preview.manualProtected} protegidas manualmente</span></div>}
        <div className="editor-actions-right">
          <button type="button" className="secondary-button" disabled={busyId === suggestion.id} onClick={() => previewSuggestion(suggestion)}>{busyId === suggestion.id ? 'Comprobando…' : validated ? 'Recalcular preview' : 'Previsualizar impacto'}</button>
          <button type="button" className="primary-inline-button" disabled={!validated || busyId === suggestion.id} onClick={() => createRule(suggestion)}>Crear regla validada</button>
        </div>
      </article>;
    })}
  </div>;
}
