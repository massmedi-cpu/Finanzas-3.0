import Link from 'next/link';
import { resolveClassificationOrigin } from '../../src/domain/classification-origin';
import { getNormalizedBootstrap } from '../../src/normalized/client';
import { getRuleSuggestions } from '../../src/private-data/explainability';
import SuggestionManager from './SuggestionManager';

export const dynamic = 'force-dynamic';

export default async function ExplicabilidadPage() {
  let dataError = false;
  let rows: Array<{
    id: string;
    date: string;
    label: string;
    detail: string;
    origin: 'source' | 'rule' | 'manual' | 'split';
    merchant: string;
    concept: string;
    category: string;
    subcategory: string;
    amount: number;
  }> = [];
  let suggestions: Awaited<ReturnType<typeof getRuleSuggestions>> = [];

  try {
    const [bootstrap, candidateRules] = await Promise.all([
      getNormalizedBootstrap(100),
      getRuleSuggestions(20),
    ]);
    if (!bootstrap.state.inSync) throw new Error('normalized-source-not-ready');
    rows = bootstrap.page.items.map((row) => {
      const result = resolveClassificationOrigin({
        sourceCategory: row.sourceCategory || '',
        category: row.category || '',
        sourceSubcategory: row.sourceSubcategory || '',
        subcategory: row.subcategory || '',
        sourceMerchant: row.sourceMerchant || '',
        merchant: row.merchant || '',
        hasOverride: Boolean(row.hasOverride),
        ruleApplied: Boolean(row.ruleApplied),
        appliedRuleName: row.appliedRuleName || null,
        splitCount: row.splits?.length || 0,
      });
      return {
        id: row.id,
        date: row.date,
        ...result,
        merchant: row.merchant || row.sourceMerchant || '',
        concept: row.concept || '',
        category: row.category || '',
        subcategory: row.subcategory || '',
        amount: Number(row.amount) || 0,
      };
    });
    suggestions = candidateRules;
  } catch {
    dataError = true;
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.origin] += 1;
    return acc;
  }, { source: 0, rule: 0, manual: 0, split: 0 });

  return <main className="page">
    <section className="page-header">
      <div><div className="eyebrow">Explicabilidad</div><h1>Comprueba por qué cada dato aparece así</h1><p className="subtitle">Finanzas distingue la fuente bancaria, las reglas automáticas, tus ajustes manuales y las divisiones. La prioridad es siempre división → manual → regla → fuente.</p></div>
      {!dataError && <span className="badge">Últimos {rows.length} movimientos</span>}
    </section>

    {dataError ? <div className="status-panel status-danger"><div><div className="status-title">No se puede explicar la clasificación con garantías</div><div className="status-copy">La pantalla se detiene si falla el modelo normalizado o el motor privado de sugerencias.</div></div></div> : <>
      <section className="grid grid-4">
        <article className="card"><div className="metric-label">Fuente bancaria</div><div className="metric-value">{counts.source}</div><p className="metric-note">Sin sustitución privada en los últimos 100.</p></article>
        <article className="card"><div className="metric-label">Reglas automáticas</div><div className="metric-value">{counts.rule}</div><p className="metric-note">Clasificados por una regla activa.</p></article>
        <article className="card"><div className="metric-label">Ajustes manuales</div><div className="metric-value">{counts.manual}</div><p className="metric-note">Tus decisiones tienen prioridad.</p></article>
        <article className="card"><div className="metric-label">Movimientos divididos</div><div className="metric-value">{counts.split}</div><p className="metric-note">La imputación procede de sus partes.</p></article>
      </section>

      <section className="card section-gap">
        <div className="card-heading-row"><div><div className="eyebrow">Sugerencias</div><h2 className="section-title">Patrones consistentes que podrías automatizar</h2></div><Link href="/reglas" prefetch={false} className="text-link">Gestionar reglas</Link></div>
        <p className="metric-note">Solo aparecen comercios con al menos 3 movimientos, sin automatización/override manual y ≥80 % de consistencia. Crear una regla exige además ejecutar el preview real.</p>
        <SuggestionManager initialSuggestions={suggestions} />
      </section>

      <section className="card section-gap">
        <div className="card-heading-row"><div><div className="eyebrow">Trazabilidad reciente</div><h2 className="section-title">Procedencia de la clasificación</h2></div><Link href="/movimientos" prefetch={false} className="text-link">Abrir movimientos</Link></div>
        <div className="explain-list">{rows.slice(0, 40).map((row) => <article className="explain-row" key={row.id}>
          <div><strong>{row.merchant || row.concept || 'Sin concepto'}</strong><p>{row.date} · {row.category || 'Sin categoría'}{row.subcategory ? ` · ${row.subcategory}` : ''}</p><small>{row.detail}</small></div>
          <div className="explain-side"><span className={`origin origin-${row.origin}`}>{row.label}</span><strong className={row.amount < 0 ? 'amount-negative' : 'amount-positive'}>{row.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong></div>
        </article>)}</div>
      </section>
    </>}
  </main>;
}
