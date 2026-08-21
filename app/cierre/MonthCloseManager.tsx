'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MonthCloseAssessment } from '../../src/domain/month-close-engine';
import type { MonthClosureRecord } from '../../src/private-data/month-closure';

interface Props {
  yearMonth: string;
  assessment: MonthCloseAssessment;
  closure: MonthClosureRecord | null;
  snapshot: Record<string, unknown>;
}

export default function MonthCloseManager({ yearMonth, assessment, closure, snapshot }: Props) {
  const router = useRouter();
  const [note, setNote] = useState(closure?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closed = closure?.status === 'closed';

  async function mutate(action: 'close' | 'reopen') {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/private/month-closure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yearMonth, action, note, snapshot }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'closure-failed');
      router.refresh();
    } catch {
      setError(action === 'close' ? 'No se ha podido cerrar el mes.' : 'No se ha podido reabrir el mes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`card close-action-card${closed ? ' close-action-card-closed' : ''}`}>
      <div className="card-heading-row">
        <div>
          <div className="eyebrow">Estado del cierre</div>
          <h2 className="section-title">{closed ? 'Periodo cerrado' : assessment.ready ? 'Listo para cerrar' : 'Cierre bloqueado'}</h2>
        </div>
        <span className={`state ${closed ? 'state-ok' : assessment.ready ? 'state-ok' : 'state-warning'}`}>{closed ? 'Cerrado' : assessment.ready ? 'Preparado' : `${assessment.blockers.length} bloqueos`}</span>
      </div>

      {closed ? (
        <p className="metric-note">Cerrado {closure?.closed_at ? new Date(closure.closed_at).toLocaleString('es-ES') : ''}. Reabrir no elimina el histórico: registra un nuevo evento de auditoría.</p>
      ) : assessment.ready ? (
        <p className="metric-note">Todos los controles obligatorios están resueltos. El cierre guardará una fotografía de las métricas y desviaciones actuales.</p>
      ) : (
        <p className="metric-note">Resuelve los bloqueadores antes de cerrar. Las advertencias no impiden el cierre, pero quedan documentadas en la fotografía.</p>
      )}

      <label className="form-field close-note-field">
        <span>Nota del cierre</span>
        <textarea className="control textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Mes revisado; gasto extraordinario de vacaciones documentado." />
      </label>

      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="editor-actions-right close-actions">
        {closed ? (
          <button type="button" className="secondary-button" disabled={saving} onClick={() => mutate('reopen')}>{saving ? 'Reabriendo…' : 'Reabrir periodo'}</button>
        ) : (
          <button type="button" className="primary-inline-button" disabled={saving || !assessment.ready} onClick={() => mutate('close')}>{saving ? 'Cerrando…' : 'Cerrar periodo'}</button>
        )}
      </div>
    </section>
  );
}
