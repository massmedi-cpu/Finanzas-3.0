import assert from 'node:assert/strict';
import { buildForecastCalendar, buildForecastYearlyOutlook } from '../src/domain/forecast-calendar-engine.ts';
import { buildLongHorizonForecast, maxScenarioHorizonMonths, normalizeHorizonMonths } from '../src/domain/long-horizon-engine.ts';

const pattern = {
  key: 'expense|cuenta|recibo mensual',
  description: 'Recibo mensual',
  category: 'Vivienda',
  averageAmount: -50,
  intervalDays: 30,
  occurrences: 12,
  lastDate: '2026-08-01',
  confidence: 0.98,
};

const planned = [{
  id: 'planned-monthly',
  title: 'Aportación planificada',
  expected_date: '2026-09-01',
  amount: -100,
  category: 'Ahorro',
  recurrence: 'monthly',
  recurrence_end: null,
  active: true,
}];

assert.equal(normalizeHorizonMonths(0), 12);
assert.equal(normalizeHorizonMonths(120), 60);
assert.equal(maxScenarioHorizonMonths([
  { id: 'a', name: '12m', income_change_pct: 0, expense_change_pct: 0, monthly_net_adjustment: 0, monthly_savings_allocation: 0, starting_balance_adjustment: 0, horizon_months: 12, active: true },
  { id: 'b', name: '60m', income_change_pct: 0, expense_change_pct: 0, monthly_net_adjustment: 0, monthly_savings_allocation: 0, starting_balance_adjustment: 0, horizon_months: 60, active: true },
], 12), 60);

const oneYear = buildLongHorizonForecast([pattern], planned, '2026-08-21', 12);
assert.equal(oneYear.horizonMonths, 12);
assert.equal(oneYear.horizonDate, '2027-08-21');
assert.equal(oneYear.movements.every((movement) => movement.expectedDate > '2026-08-21' && movement.expectedDate <= oneYear.horizonDate), true);

const fiveYears = buildLongHorizonForecast([pattern], planned, '2026-08-21', 60);
assert.equal(fiveYears.horizonMonths, 60);
assert.equal(fiveYears.horizonDate, '2031-08-21');
assert.equal(fiveYears.movements.every((movement) => movement.expectedDate > '2026-08-21' && movement.expectedDate <= fiveYears.horizonDate), true);

const detectedFiveYears = fiveYears.movements.filter((movement) => movement.source === 'detected');
const plannedFiveYears = fiveYears.movements.filter((movement) => movement.source === 'planned');
assert.ok(detectedFiveYears.length >= 55, `Un patrón mensual no puede truncarse a 24 ocurrencias: ${detectedFiveYears.length}`);
assert.equal(plannedFiveYears.length, 60, 'Un evento mensual planificado debe cubrir los 60 meses completos');
assert.ok(fiveYears.movements.length > oneYear.movements.length * 4, 'El horizonte de 60 meses debe contener materialmente más proyección que 12 meses');

const ids = new Set(fiveYears.movements.map((movement) => movement.id));
assert.equal(ids.size, fiveYears.movements.length, 'Las ventanas de horizonte largo no pueden duplicar movimientos');

const calendar = buildForecastCalendar([
  { id: 'income', description: 'Nómina', category: 'Ingresos', expectedDate: '2026-09-01', amount: 1000, confidence: 1, source: 'planned' },
  { id: 'expense-a', description: 'Recibo', category: 'Vivienda', expectedDate: '2026-09-02', amount: -300, confidence: 1, source: 'planned' },
  { id: 'expense-b', description: 'Compra', category: 'Compras', expectedDate: '2026-10-02', amount: -900, confidence: 1, source: 'detected' },
], 500, '2026-08-21', 3);
assert.equal(calendar.length, 3);
assert.equal(calendar[0].month, '2026-08');
assert.equal(calendar[0].endingBalance, 500);
assert.equal(calendar[1].income, 1000);
assert.equal(calendar[1].expenses, 300);
assert.equal(calendar[1].netCashFlow, 700);
assert.equal(calendar[1].endingBalance, 1200);
assert.equal(calendar[2].endingBalance, 300);
assert.equal(calendar[2].firstNegativeDate, null);

const negativeCalendar = buildForecastCalendar([
  { id: 'large-expense', description: 'Pago', category: 'Vivienda', expectedDate: '2026-09-04', amount: -700, confidence: 1, source: 'planned' },
], 500, '2026-08-21', 2);
assert.equal(negativeCalendar[1].firstNegativeDate, '2026-09-04');
assert.equal(negativeCalendar[1].lowestBalance, -200);

const yearly = buildForecastYearlyOutlook([
  { id: 'y-2026-income', description: 'Ingreso', category: 'Ingresos', expectedDate: '2026-09-01', amount: 1000, confidence: 1, source: 'planned' },
  { id: 'y-2026-expense', description: 'Gasto', category: 'Vivienda', expectedDate: '2026-12-01', amount: -400, confidence: 1, source: 'planned' },
  { id: 'y-2027-expense', description: 'Gasto', category: 'Vivienda', expectedDate: '2027-01-15', amount: -700, confidence: 1, source: 'detected' },
], 500, '2026-08-21', '2027-08-21');
assert.equal(yearly.length, 2);
assert.equal(yearly[0].year, '2026');
assert.equal(yearly[0].netCashFlow, 600);
assert.equal(yearly[0].endingBalance, 1100);
assert.equal(yearly[1].year, '2027');
assert.equal(yearly[1].endingBalance, 400);
assert.equal(yearly[1].movementCount, 1);

console.log('Long-horizon regression tests: OK');
