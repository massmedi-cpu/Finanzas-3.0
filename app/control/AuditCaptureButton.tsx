'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AuditCaptureButton() {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function capture() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/private/system-audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: note.trim() || null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'capture-failed');
      setNote('');
      router.refresh();
    } catch {
      setError('No se ha podido guardar la auditoría. El estado actual no se ha modificado.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="audit-capture"><input className="control" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional para esta auditoría" maxLength={1000} /><button type="button" className="primary-inline-button" disabled={saving} onClick={capture}>{saving ? 'Guardando…' : 'Guardar auditoría'}</button>{error && <div className="form-error" role="alert">{error}</div>}</div>;
}
