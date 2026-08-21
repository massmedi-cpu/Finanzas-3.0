'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { ClassificationRuleRecord, RuleDirection, RuleMatchField, RuleMatchMode, RulePreview } from '../../src/private-data/rules';

interface RuleDraft {
  id: string | null;
  name: string;
  active: boolean;
  priority: string;
  matchField: RuleMatchField;
  matchMode: RuleMatchMode;
  matchText: string;
  accountKey: string;
  direction: RuleDirection;
  targetCategory: string;
  targetSubcategory: string;
  targetMerchant: string;
  notes: string;
}

const emptyDraft: RuleDraft = {
  id: null,
  name: '',
  active: true,
  priority: '100',
  matchField: 'merchant_or_concept',
  matchMode: 'contains',
  matchText: '',
  accountKey: '',
  direction: 'any',
  targetCategory: '',
  targetSubcategory: '',
  targetMerchant: '',
  notes: '',
};

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function toDraft(rule: ClassificationRuleRecord): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    active: rule.active,
    priority: String(rule.priority),
    matchField: rule.match_field,
    matchMode: rule.match_mode,
    matchText: rule.match_text,
    accountKey: rule.account_key || '',
    direction: rule.direction,
    targetCategory: rule.target_category || '',
    targetSubcategory: rule.target_subcategory || '',
    targetMerchant: rule.target_merchant || '',
    notes: rule.notes || '',
  };
}

function signature(draft: RuleDraft) {
  return JSON.stringify({
    name: draft.name.trim(),
    active: draft.active,
    priority: Number(draft.priority) || 0,
    matchField: draft.matchField,
    matchMode: draft.matchMode,
    matchText: draft.matchText.trim(),
    accountKey: draft.accountKey,
    direction: draft.direction,
    targetCategory: draft.targetCategory.trim(),
    targetSubcategory: draft.targetSubcategory.trim(),
    targetMerchant: draft.targetMerchant.trim(),
    notes: draft.notes.trim(),
  });
}

function payload(draft: RuleDraft) {
  return {
    id: draft.id || undefined,
    name: draft.name.trim(),
    active: draft.active,
    priority: Math.max(0, Math.min(1000, Math.trunc(Number(draft.priority) || 100))),
    matchField: draft.matchField,
    matchMode: draft.matchMode,
    matchText: draft.matchText.trim(),
    accountKey: draft.accountKey || null,
    direction: draft.direction,
    targetCategory: draft.targetCategory.trim() || null,
    targetSubcategory: draft.targetSubcategory.trim() || null,
    targetMerchant: draft.targetMerchant.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

function ruleSummary(rule: ClassificationRuleRecord) {
  const field = rule.match_field === 'merchant' ? 'comercio' : rule.match_field === 'concept' ? 'concepto' : 'comercio o concepto';
  const mode = rule.match_mode === 'equals' ? 'es exactamente' : rule.match_mode === 'starts_with' ? 'empieza por' : 'contiene';
  return `${field} ${mode} “${rule.match_text}”`;
}

function targetSummary(rule: ClassificationRuleRecord) {
  return [rule.target_category && `Categoría: ${rule.target_category}`, rule.target_subcategory && `Subcategoría: ${rule.target_subcategory}`, rule.target_merchant && `Comercio: ${rule.target_merchant}`].filter(Boolean).join(' · ');
}

export default function RulesManager({ initialRules, categories, accounts }: {
  initialRules: ClassificationRuleRecord[];
  categories: string[];
  accounts: Array<{ accountKey: string; name: string }>;
}) {
  const [rules, setRules] = useState(initialRules);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentSignature = useMemo(() => signature(draft), [draft]);
  const previewValid = Boolean(preview && previewSignature === currentSignature);

  function patchDraft(patch: Partial<RuleDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError('');
  }

  function resetForm() {
    setDraft(emptyDraft);
    setPreview(null);
    setPreviewSignature('');
    setError('');
  }

  function edit(rule: ClassificationRuleRecord) {
    setDraft(toDraft(rule));
    setPreview(null);
    setPreviewSignature('');
    setError('');
    document.getElementById('rule-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function runPreview() {
    if (!draft.matchText.trim() || (!draft.targetCategory.trim() && !draft.targetSubcategory.trim() && !draft.targetMerchant.trim())) {
      setError('Indica qué debe reconocer la regla y al menos un resultado que aplicar.');
      return;
    }
    setPreviewing(true);
    setError('');
    try {
      const response = await fetch('/api/private/rule-preview', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(draft)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'preview-failed');
      setPreview(body as RulePreview);
      setPreviewSignature(currentSignature);
    } catch {
      setError('No se ha podido calcular el impacto. No se guardará ninguna regla sin una vista previa válida.');
      setPreview(null);
      setPreviewSignature('');
    } finally {
      setPreviewing(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previewValid) {
      setError('Vuelve a calcular la vista previa antes de guardar: el formulario ha cambiado o todavía no se ha validado su impacto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/private/rule', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(draft)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.rule) throw new Error(body.error || 'save-failed');
      const saved = body.rule as ClassificationRuleRecord;
      setRules((current) => draft.id ? current.map((rule) => rule.id === draft.id ? saved : rule) : [...current, saved]);
      resetForm();
    } catch {
      setError('No se ha podido guardar la regla. Los movimientos y tus ajustes manuales permanecen intactos.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: ClassificationRuleRecord) {
    setError('');
    try {
      const response = await fetch('/api/private/rule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload(toDraft(rule)), id: rule.id, active: !rule.active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.rule) throw new Error('toggle-failed');
      setRules((current) => current.map((item) => item.id === rule.id ? body.rule : item));
      if (draft.id === rule.id) resetForm();
    } catch {
      setError('No se ha podido cambiar el estado de la regla.');
    }
  }

  async function remove(rule: ClassificationRuleRecord) {
    if (!window.confirm(`¿Eliminar la regla “${rule.name}”? Sus efectos automáticos desaparecerán inmediatamente; los ajustes manuales seguirán intactos.`)) return;
    setError('');
    try {
      const response = await fetch(`/api/private/rule?id=${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('delete-failed');
      setRules((current) => current.filter((item) => item.id !== rule.id));
      if (draft.id === rule.id) resetForm();
    } catch {
      setError('No se ha podido eliminar la regla.');
    }
  }

  return (
    <>
      <section className="grid grid-2">
        <article className="card" id="rule-editor">
          <div className="card-heading-row"><div><div className="eyebrow">Editor</div><h2 className="section-title">{draft.id ? 'Editar regla' : 'Nueva regla'}</h2></div>{draft.id && <button type="button" className="secondary-button" onClick={resetForm}>Nueva</button>}</div>
          <form className="form-stack" onSubmit={save}>
            <div className="form-grid"><label className="form-field"><span>Nombre</span><input className="control" value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} placeholder="Ej. Mercadona → Alimentación" /></label><label className="form-field"><span>Prioridad</span><input className="control" type="number" min="0" max="1000" value={draft.priority} onChange={(event) => patchDraft({ priority: event.target.value })} /></label></div>
            <div className="form-grid"><label className="form-field"><span>Buscar en</span><select className="control" value={draft.matchField} onChange={(event) => patchDraft({ matchField: event.target.value as RuleMatchField })}><option value="merchant_or_concept">Comercio o concepto</option><option value="merchant">Solo comercio</option><option value="concept">Solo concepto</option></select></label><label className="form-field"><span>Coincidencia</span><select className="control" value={draft.matchMode} onChange={(event) => patchDraft({ matchMode: event.target.value as RuleMatchMode })}><option value="contains">Contiene</option><option value="equals">Es exactamente</option><option value="starts_with">Empieza por</option></select></label></div>
            <label className="form-field"><span>Texto a reconocer</span><input className="control" value={draft.matchText} onChange={(event) => patchDraft({ matchText: event.target.value })} placeholder="Ej. MERCADONA" /></label>
            <div className="form-grid"><label className="form-field"><span>Cuenta</span><select className="control" value={draft.accountKey} onChange={(event) => patchDraft({ accountKey: event.target.value })}><option value="">Todas las cuentas</option>{accounts.map((account) => <option key={account.accountKey} value={account.accountKey}>{account.name || account.accountKey}</option>)}</select></label><label className="form-field"><span>Dirección</span><select className="control" value={draft.direction} onChange={(event) => patchDraft({ direction: event.target.value as RuleDirection })}><option value="any">Ingresos y gastos</option><option value="expense">Solo gastos</option><option value="income">Solo ingresos</option></select></label></div>
            <div className="rule-target-box"><div className="eyebrow">Resultado automático</div><div className="form-grid"><label className="form-field"><span>Categoría</span><input className="control" list="rule-categories" value={draft.targetCategory} onChange={(event) => patchDraft({ targetCategory: event.target.value })} /><datalist id="rule-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label><label className="form-field"><span>Subcategoría</span><input className="control" value={draft.targetSubcategory} onChange={(event) => patchDraft({ targetSubcategory: event.target.value })} /></label></div><label className="form-field"><span>Nombre normalizado del comercio</span><input className="control" value={draft.targetMerchant} onChange={(event) => patchDraft({ targetMerchant: event.target.value })} /></label></div>
            <label className="form-field"><span>Notas de la regla</span><textarea className="control textarea" rows={3} value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} /></label>
            <label className="check-row"><input type="checkbox" checked={draft.active} onChange={(event) => patchDraft({ active: event.target.checked })} /><span>Activar al guardar</span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="rule-editor-actions"><button type="button" className="secondary-button" onClick={runPreview} disabled={previewing || saving}>{previewing ? 'Calculando…' : 'Previsualizar impacto'}</button><button type="submit" className="primary-inline-button" disabled={!previewValid || saving}>{saving ? 'Guardando…' : draft.id ? 'Guardar regla' : 'Crear regla'}</button></div>
            <p className="metric-note">Guardar solo se habilita después de previsualizar exactamente los criterios actuales. Una edición manual de un movimiento siempre gana a una regla.</p>
          </form>
        </article>

        <article className="card">
          <div className="card-heading-row"><div><div className="eyebrow">Vista previa</div><h2 className="section-title">Impacto antes de aplicar</h2></div>{previewValid && <span className="state state-ok">Validada</span>}</div>
          {!preview ? <div className="empty compact-empty">Completa la regla y pulsa “Previsualizar impacto”. No se escribirá ningún cambio durante esta comprobación.</div> : !previewValid ? <div className="status-panel status-warning"><div><div className="status-title">La vista previa ya no corresponde al formulario</div><div className="status-copy">Has cambiado algún criterio. Vuelve a calcularla antes de guardar.</div></div></div> : <><div className="rule-preview-metrics"><div><span>Coincidencias</span><strong>{preview.matched.toLocaleString('es-ES')}</strong></div><div><span>Cambiarían</span><strong>{preview.wouldChange.toLocaleString('es-ES')}</strong></div><div><span>Protegidas manualmente</span><strong>{preview.manualProtected.toLocaleString('es-ES')}</strong></div></div><div className="rule-preview-list">{preview.samples.map((sample) => <div className={`rule-preview-row${sample.manualProtected ? ' rule-preview-row-protected' : ''}`} key={sample.sourceId}><div><strong>{sample.previewMerchant || sample.sourceMerchant || sample.concept}</strong><p>{sample.date} · {sample.account || 'Cuenta histórica'} · {sample.sourceCategory || 'Sin categoría'} → {sample.previewCategory || 'Sin categoría'}</p></div><div className="rule-preview-side"><span className={Number(sample.amount) < 0 ? 'amount-negative' : 'amount-positive'}>{sample.amount == null ? '—' : euro.format(Number(sample.amount))}</span>{sample.manualProtected ? <small>Manual protegido</small> : sample.wouldChange ? <small>Cambiaría</small> : <small>Sin cambio</small>}</div></div>)}</div></>}
        </article>
      </section>

      <section className="card section-gap">
        <div className="card-heading-row"><div><div className="eyebrow">Reglas guardadas</div><h2 className="section-title">Automatizaciones privadas</h2></div><span className="badge">{rules.filter((rule) => rule.active).length} activas</span></div>
        {rules.length === 0 ? <div className="empty compact-empty">Todavía no hay reglas. La clasificación continúa exactamente como hasta ahora.</div> : <div className="rules-list">{[...rules].sort((a, b) => Number(b.active) - Number(a.active) || b.priority - a.priority).map((rule) => <article className={`rule-card${rule.active ? '' : ' rule-card-disabled'}`} key={rule.id}><div className="rule-card-main"><div className="rule-card-title"><strong>{rule.name}</strong><span className={`state ${rule.active ? 'state-ok' : 'state-review'}`}>{rule.active ? 'Activa' : 'Pausada'}</span></div><p>{ruleSummary(rule)}</p><small>{targetSummary(rule)} · prioridad {rule.priority}{rule.direction !== 'any' ? ` · ${rule.direction === 'income' ? 'solo ingresos' : 'solo gastos'}` : ''}</small></div><div className="rule-card-actions"><button type="button" className="small-button" onClick={() => edit(rule)}>Editar</button><button type="button" className="small-button" onClick={() => toggle(rule)}>{rule.active ? 'Pausar' : 'Activar'}</button><button type="button" className="danger-ghost-button" onClick={() => remove(rule)}>Eliminar</button></div></article>)}</div>}
      </section>
    </>
  );
}
