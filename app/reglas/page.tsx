import { getNormalizedForecastInputs } from '../../src/normalized/analytics-client';
import { getClassificationRules } from '../../src/private-data/rules';
import RulesManager from './RulesManager';

export const dynamic = 'force-dynamic';

export default async function ReglasPage() {
  let dataError = false;
  let rules: Awaited<ReturnType<typeof getClassificationRules>> = [];
  let categories: string[] = [];
  let accounts: Array<{ accountKey: string; name: string }> = [];

  try {
    const [storedRules, forecastInputs] = await Promise.all([
      getClassificationRules(),
      getNormalizedForecastInputs(),
    ]);
    rules = storedRules;
    categories = forecastInputs.categories || [];
    accounts = (forecastInputs.state.accounts || []).map((account) => ({ accountKey: account.accountKey, name: account.name }));
  } catch {
    dataError = true;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Reglas privadas</div>
          <h1>Automatiza sin perder el control</h1>
          <p className="subtitle">Reconoce comercios o conceptos repetidos y aplica categoría, subcategoría o nombre normalizado de forma reversible. Tus ediciones manuales tienen siempre prioridad y la fuente bancaria original nunca se modifica.</p>
        </div>
        {!dataError && <span className="badge">{rules.filter((rule) => rule.active).length} activas · {rules.length} totales</span>}
      </section>

      {dataError ? (
        <div className="status-panel status-danger"><div><div className="status-title">No se pueden gestionar reglas con garantías</div><div className="status-copy">La pantalla se detiene si no puede leer simultáneamente las reglas privadas y el estado normalizado.</div></div></div>
      ) : (
        <RulesManager initialRules={rules} categories={categories} accounts={accounts} />
      )}
    </main>
  );
}
