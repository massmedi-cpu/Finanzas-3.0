'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface FutureEventView {
  id: string;
  title: string;
  expectedDate: string;
  amount: number;
  category: string;
  account: string;
  recurrence: 'once' | 'monthly' | 'yearly';
  recurrenceEnd: string;
  active: boolean;
  notes: string;
}

export interface ScenarioView {
  id: string;
  name: string;
  incomeChangePct: number;
  expenseChangePct: number;
  monthlyNetAdjustment: number;
  monthlySavingsAllocation: number;
  startingBalanceAdjustment: number;
  horizonMonths: number;
  active: boolean;
  notes: string;
}

interface PlanningManagerProps {
  initialEvents: FutureEventView[];
  initialScenarios: ScenarioView[];
  categories: string[];
  accounts: string[];
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function numberFromInput(value: string): number {
  return Number(value.replace(',', '.'));
}

function recurrenceLabel(value: FutureEventView['recurrence']): string {
  if (value === 'monthly') return 'Mensual';
  if (value === 'yearly') return 'Anual';
  return 'Una vez';
}

export default function PlanningManager({ initialEvents, initialScenarios, categories, accounts }: PlanningManagerProps) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [eventEditingId, setEventEditingId] = useState<string | null>(null);
  const [scenarioEditingId, setScenarioEditingId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [eventError, setEventError] = useState('');
  const [scenarioError, setScenarioError] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventAmount, setEventAmount] = useState('');
  const [eventCategory, setEventCategory] = useState('');
  const [eventAccount, setEventAccount] = useState('');
  const [eventRecurrence, setEventRecurrence] = useState<FutureEventView['recurrence']>('once');
  const [eventRecurrenceEnd, setEventRecurrenceEnd] = useState('');
  const [eventActive, setEventActive] = useState(true);
  const [eventNotes, setEventNotes] = useState('');

  const [scenarioName, setScenarioName] = useState('');
  const [incomeChangePct, setIncomeChangePct] = useState('0');
  const [expenseChangePct, setExpenseChangePct] = useState('0');
  const [monthlyNetAdjustment, setMonthlyNetAdjustment] = useState('0');
  const [monthlySavingsAllocation, setMonthlySavingsAllocation] = useState('0');
  const [startingBalanceAdjustment, setStartingBalanceAdjustment] = useState('0');
  const [horizonMonths, setHorizonMonths] = useState('12');
  const [scenarioActive, setScenarioActive] = useState(true);
  const [scenarioNotes, setScenarioNotes] = useState('');

  const activeEvents = useMemo(() => events.filter((event) => event.active).length, [events]);
  const activeScenarios = useMemo(() => scenarios.filter((scenario) => scenario.active).length, [scenarios]);

  function resetEventForm() {
    setEventEditingId(null);
    setEventTitle('');
    setEventDate('');
    setEventAmount('');
    setEventCategory('');
    setEventAccount('');
    setEventRecurrence('once');
    setEventRecurrenceEnd('');
    setEventActive(true);
    setEventNotes('');
    setEventError('');
  }

  function editEvent(event: FutureEventView) {
    setEventEditingId(event.id);
    setEventTitle(event.title);
    setEventDate(event.expectedDate);
    setEventAmount(String(event.amount));
    setEventCategory(event.category);
    setEventAccount(event.account);
    setEventRecurrence(event.recurrence);
    setEventRecurrenceEnd(event.recurrenceEnd);
    setEventActive(event.active);
    setEventNotes(event.notes);
    setEventError('');
    document.getElementById('planned-event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = numberFromInput(eventAmount);
    if (!eventTitle.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(amount) || amount === 0) {
      setEventError('Indica un nombre, una fecha y un importe distinto de 0. Usa importe positivo para ingreso y negativo para gasto.');
      return;
    }
    if (eventRecurrenceEnd && eventRecurrenceEnd < eventDate) {
      setEventError('La fecha final de repetición no puede ser anterior a la primera fecha.');
      return;
    }

    setSavingEvent(true);
    setEventError('');
    try {
      const response = await fetch('/api/private/future-event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: eventEditingId || undefined,
          title: eventTitle.trim(),
          expectedDate: eventDate,
          amount,
          category: eventCategory,
          account: eventAccount,
          recurrence: eventRecurrence,
          recurrenceEnd: eventRecurrence === 'once' ? null : eventRecurrenceEnd || null,
          active: eventActive,
          notes: eventNotes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.futureEvent) throw new Error('save-failed');
      const saved = body.futureEvent;
      const next: FutureEventView = {
        id: saved.id,
        title: saved.title,
        expectedDate: saved.expected_date,
        amount: Number(saved.amount) || 0,
        category: saved.category || '',
        account: saved.account || '',
        recurrence: saved.recurrence,
        recurrenceEnd: saved.recurrence_end || '',
        active: saved.active !== false,
        notes: saved.notes || '',
      };
      setEvents((current) => eventEditingId ? current.map((item) => item.id === eventEditingId ? next : item) : [...current, next]);
      resetEventForm();
      router.refresh();
    } catch {
      setEventError('No se ha podido guardar el movimiento futuro.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function removeEvent(event: FutureEventView) {
    if (!window.confirm(`¿Eliminar “${event.title}” de la planificación? El cambio quedará registrado en el historial interno.`)) return;
    setEventError('');
    try {
      const response = await fetch(`/api/private/future-event?id=${encodeURIComponent(event.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('delete-failed');
      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (eventEditingId === event.id) resetEventForm();
      router.refresh();
    } catch {
      setEventError('No se ha podido eliminar el movimiento futuro.');
    }
  }

  function resetScenarioForm() {
    setScenarioEditingId(null);
    setScenarioName('');
    setIncomeChangePct('0');
    setExpenseChangePct('0');
    setMonthlyNetAdjustment('0');
    setMonthlySavingsAllocation('0');
    setStartingBalanceAdjustment('0');
    setHorizonMonths('12');
    setScenarioActive(true);
    setScenarioNotes('');
    setScenarioError('');
  }

  function editScenario(scenario: ScenarioView) {
    setScenarioEditingId(scenario.id);
    setScenarioName(scenario.name);
    setIncomeChangePct(String(scenario.incomeChangePct));
    setExpenseChangePct(String(scenario.expenseChangePct));
    setMonthlyNetAdjustment(String(scenario.monthlyNetAdjustment));
    setMonthlySavingsAllocation(String(scenario.monthlySavingsAllocation));
    setStartingBalanceAdjustment(String(scenario.startingBalanceAdjustment));
    setHorizonMonths(String(scenario.horizonMonths));
    setScenarioActive(scenario.active);
    setScenarioNotes(scenario.notes);
    setScenarioError('');
    document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const income = numberFromInput(incomeChangePct);
    const expense = numberFromInput(expenseChangePct);
    const monthly = numberFromInput(monthlyNetAdjustment);
    const savings = numberFromInput(monthlySavingsAllocation);
    const starting = numberFromInput(startingBalanceAdjustment);
    const horizon = Number(horizonMonths);

    if (!scenarioName.trim() || !Number.isFinite(income) || income < -100 || income > 1000 || !Number.isFinite(expense) || expense < -100 || expense > 1000 || !Number.isFinite(monthly) || !Number.isFinite(savings) || savings < 0 || !Number.isFinite(starting) || !Number.isInteger(horizon) || horizon < 1 || horizon > 60) {
      setScenarioError('Revisa los valores: porcentajes entre -100% y 1000%, ahorro igual o superior a 0 y horizonte de 1 a 60 meses.');
      return;
    }

    setSavingScenario(true);
    setScenarioError('');
    try {
      const response = await fetch('/api/private/scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: scenarioEditingId || undefined,
          name: scenarioName.trim(),
          incomeChangePct: income,
          expenseChangePct: expense,
          monthlyNetAdjustment: monthly,
          monthlySavingsAllocation: savings,
          startingBalanceAdjustment: starting,
          horizonMonths: horizon,
          active: scenarioActive,
          notes: scenarioNotes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.scenario) throw new Error('save-failed');
      const saved = body.scenario;
      const next: ScenarioView = {
        id: saved.id,
        name: saved.name,
        incomeChangePct: Number(saved.income_change_pct) || 0,
        expenseChangePct: Number(saved.expense_change_pct) || 0,
        monthlyNetAdjustment: Number(saved.monthly_net_adjustment) || 0,
        monthlySavingsAllocation: Number(saved.monthly_savings_allocation) || 0,
        startingBalanceAdjustment: Number(saved.starting_balance_adjustment) || 0,
        horizonMonths: Number(saved.horizon_months) || 12,
        active: saved.active !== false,
        notes: saved.notes || '',
      };
      setScenarios((current) => scenarioEditingId ? current.map((item) => item.id === scenarioEditingId ? next : item) : [...current, next]);
      resetScenarioForm();
      router.refresh();
    } catch {
      setScenarioError('No se ha podido guardar el escenario.');
    } finally {
      setSavingScenario(false);
    }
  }

  async function removeScenario(scenario: ScenarioView) {
    if (!window.confirm(`¿Eliminar el escenario “${scenario.name}”? El cambio quedará registrado en el historial interno.`)) return;
    setScenarioError('');
    try {
      const response = await fetch(`/api/private/scenario?id=${encodeURIComponent(scenario.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('delete-failed');
      setScenarios((current) => current.filter((item) => item.id !== scenario.id));
      if (scenarioEditingId === scenario.id) resetScenarioForm();
      router.refresh();
    } catch {
      setScenarioError('No se ha podido eliminar el escenario.');
    }
  }

  return (
    <section className="planning-studio section-gap" aria-label="Planificación financiera editable">
      <div className="planning-heading">
        <div>
          <div className="eyebrow">Planificación inteligente</div>
          <h2 className="section-title planning-title">Calendario y simulador</h2>
          <p className="metric-note">Añade hechos futuros que ya conoces y prueba escenarios sin alterar ningún movimiento bancario original.</p>
        </div>
        <div className="planning-counters">
          <span className="badge">{activeEvents} eventos activos</span>
          <span className="badge">{activeScenarios} escenarios activos</span>
        </div>
      </div>

      <div className="grid planning-grid">
        <div className="planning-column">
          <form id="planned-event-form" className="card planning-form" onSubmit={saveEvent}>
            <div className="eyebrow">{eventEditingId ? 'Editar evento' : 'Movimiento futuro'}</div>
            <h3 className="section-title">{eventEditingId ? 'Actualiza el movimiento previsto' : 'Añade un ingreso o gasto conocido'}</h3>
            <div className="form-stack">
              <label className="form-field"><span>Nombre</span><input className="control" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Ej. Seguro del coche" /></label>
              <div className="form-grid">
                <label className="form-field"><span>Fecha</span><input className="control" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
                <label className="form-field"><span>Importe (€)</span><input className="control" inputMode="decimal" value={eventAmount} onChange={(e) => setEventAmount(e.target.value)} placeholder="-120,00" /><small>Positivo = ingreso · negativo = gasto</small></label>
              </div>
              <div className="form-grid">
                <label className="form-field"><span>Categoría</span><input className="control" list="planning-categories" value={eventCategory} onChange={(e) => setEventCategory(e.target.value)} placeholder="Opcional" /></label>
                <label className="form-field"><span>Cuenta</span><input className="control" list="planning-accounts" value={eventAccount} onChange={(e) => setEventAccount(e.target.value)} placeholder="Opcional" /></label>
              </div>
              <div className="form-grid">
                <label className="form-field"><span>Repetición</span><select className="control" value={eventRecurrence} onChange={(e) => setEventRecurrence(e.target.value as FutureEventView['recurrence'])}><option value="once">Una vez</option><option value="monthly">Cada mes</option><option value="yearly">Cada año</option></select></label>
                <label className="form-field"><span>Repetir hasta</span><input className="control" type="date" value={eventRecurrenceEnd} disabled={eventRecurrence === 'once'} onChange={(e) => setEventRecurrenceEnd(e.target.value)} /></label>
              </div>
              <label className="form-field"><span>Notas</span><textarea className="control textarea" rows={2} value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} /></label>
              <label className="check-row"><input type="checkbox" checked={eventActive} onChange={(e) => setEventActive(e.target.checked)} /><span>Incluir en la previsión</span></label>
              {eventError && <div className="form-error" role="alert">{eventError}</div>}
              <div className="editor-actions-right">
                {eventEditingId && <button type="button" className="secondary-button" disabled={savingEvent} onClick={resetEventForm}>Cancelar</button>}
                <button className="primary-inline-button" type="submit" disabled={savingEvent}>{savingEvent ? 'Guardando…' : eventEditingId ? 'Guardar cambios' : 'Añadir a previsión'}</button>
              </div>
            </div>
            <datalist id="planning-categories">{categories.map((value) => <option value={value} key={value} />)}</datalist>
            <datalist id="planning-accounts">{accounts.map((value) => <option value={value} key={value} />)}</datalist>
          </form>

          <section className="card planning-list-card">
            <div className="card-heading-row"><div><div className="eyebrow">Calendario manual</div><h3 className="section-title">Movimientos planificados</h3></div><span className="badge">{events.length}</span></div>
            {events.length === 0 ? <div className="empty compact-empty">Añade aquí pagos o ingresos que conoces con antelación.</div> : (
              <div className="planning-list">
                {[...events].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)).map((item) => (
                  <article className={`planning-item${item.active ? '' : ' planning-item-inactive'}`} key={item.id}>
                    <div className="planning-item-main">
                      <div><div className="row-title">{item.title}</div><div className="row-meta">{item.expectedDate} · {recurrenceLabel(item.recurrence)}{item.category ? ` · ${item.category}` : ''}</div></div>
                      <div className={`amount ${item.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(item.amount)}</div>
                    </div>
                    <div className="planning-item-actions"><span className={`state ${item.active ? 'state-ok' : 'state-muted'}`}>{item.active ? 'Activo' : 'Pausado'}</span><button className="small-button" type="button" onClick={() => editEvent(item)}>Editar</button><button className="danger-ghost-button small-danger" type="button" onClick={() => removeEvent(item)}>Eliminar</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="planning-column">
          <form id="scenario-form" className="card planning-form" onSubmit={saveScenario}>
            <div className="eyebrow">{scenarioEditingId ? 'Editar escenario' : 'Simulador what-if'}</div>
            <h3 className="section-title">{scenarioEditingId ? 'Actualiza las hipótesis' : 'Prueba una situación alternativa'}</h3>
            <div className="form-stack">
              <label className="form-field"><span>Nombre del escenario</span><input className="control" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Ej. Reducir gastos 10%" /></label>
              <div className="form-grid">
                <label className="form-field"><span>Cambio ingresos (%)</span><input className="control" inputMode="decimal" value={incomeChangePct} onChange={(e) => setIncomeChangePct(e.target.value)} /></label>
                <label className="form-field"><span>Cambio gastos (%)</span><input className="control" inputMode="decimal" value={expenseChangePct} onChange={(e) => setExpenseChangePct(e.target.value)} /><small>-10 = gastar un 10% menos</small></label>
              </div>
              <div className="form-grid">
                <label className="form-field"><span>Ajuste neto mensual (€)</span><input className="control" inputMode="decimal" value={monthlyNetAdjustment} onChange={(e) => setMonthlyNetAdjustment(e.target.value)} /><small>Positivo mejora el flujo; negativo lo reduce</small></label>
                <label className="form-field"><span>Ahorro reservado al mes (€)</span><input className="control" inputMode="decimal" value={monthlySavingsAllocation} onChange={(e) => setMonthlySavingsAllocation(e.target.value)} /></label>
              </div>
              <div className="form-grid">
                <label className="form-field"><span>Ajuste saldo inicial (€)</span><input className="control" inputMode="decimal" value={startingBalanceAdjustment} onChange={(e) => setStartingBalanceAdjustment(e.target.value)} /></label>
                <label className="form-field"><span>Horizonte (meses)</span><input className="control" type="number" min="1" max="60" step="1" value={horizonMonths} onChange={(e) => setHorizonMonths(e.target.value)} /></label>
              </div>
              <label className="form-field"><span>Notas</span><textarea className="control textarea" rows={2} value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} /></label>
              <label className="check-row"><input type="checkbox" checked={scenarioActive} onChange={(e) => setScenarioActive(e.target.checked)} /><span>Mostrar escenario en la comparativa</span></label>
              {scenarioError && <div className="form-error" role="alert">{scenarioError}</div>}
              <div className="editor-actions-right">
                {scenarioEditingId && <button type="button" className="secondary-button" disabled={savingScenario} onClick={resetScenarioForm}>Cancelar</button>}
                <button className="primary-inline-button" type="submit" disabled={savingScenario}>{savingScenario ? 'Guardando…' : scenarioEditingId ? 'Guardar cambios' : 'Crear escenario'}</button>
              </div>
            </div>
          </form>

          <section className="card planning-list-card">
            <div className="card-heading-row"><div><div className="eyebrow">Comparativas</div><h3 className="section-title">Escenarios guardados</h3></div><span className="badge">{scenarios.length}</span></div>
            {scenarios.length === 0 ? <div className="empty compact-empty">Crea un escenario para comparar decisiones antes de tomarlas.</div> : (
              <div className="planning-list">
                {scenarios.map((item) => (
                  <article className={`planning-item${item.active ? '' : ' planning-item-inactive'}`} key={item.id}>
                    <div className="planning-item-main">
                      <div><div className="row-title">{item.name}</div><div className="row-meta">{item.horizonMonths} meses · ingresos {item.incomeChangePct >= 0 ? '+' : ''}{item.incomeChangePct}% · gastos {item.expenseChangePct >= 0 ? '+' : ''}{item.expenseChangePct}%</div></div>
                      <span className={`state ${item.active ? 'state-ok' : 'state-muted'}`}>{item.active ? 'Activo' : 'Pausado'}</span>
                    </div>
                    <div className="planning-item-actions"><button className="small-button" type="button" onClick={() => editScenario(item)}>Editar</button><button className="danger-ghost-button small-danger" type="button" onClick={() => removeScenario(item)}>Eliminar</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
