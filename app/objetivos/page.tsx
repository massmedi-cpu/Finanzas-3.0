import { getPrivateState } from '../../src/private-data/client';
import GoalManager, { type GoalView } from './GoalManager';

export const dynamic = 'force-dynamic';

export default async function ObjetivosPage() {
  let goals: GoalView[] = [];
  let privateError = false;

  try {
    const state = await getPrivateState();
    goals = state.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount) || 0,
      currentAmount: Number(goal.current_amount) || 0,
      targetDate: goal.target_date || '',
      monthlyContribution: goal.monthly_contribution == null ? null : Number(goal.monthly_contribution),
      active: goal.active !== false,
      notes: goal.notes || '',
    }));
  } catch {
    privateError = true;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Objetivos</div>
          <h1>Convierte tus planes en números</h1>
          <p className="subtitle">Define cuánto necesitas, cuánto llevas y qué aportación mensual te acerca a cada meta.</p>
        </div>
        <span className="badge">Capa privada</span>
      </section>

      {privateError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se han podido cargar tus objetivos</div>
            <div className="status-copy">No se permite editar mientras la capa privada no esté disponible.</div>
          </div>
        </div>
      ) : (
        <GoalManager initialGoals={goals} />
      )}
    </main>
  );
}
