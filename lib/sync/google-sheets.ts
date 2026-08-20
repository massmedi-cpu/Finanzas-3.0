// Finanzas Alberto V1.0.0
// Módulo preparado para sincronización Google Sheets.
// Regla fundamental: lectura exclusiva.

export interface SourceMovement {
  id: string;
  date: string;
  account: string;
  concept: string;
  amount: number;
  balance?: number;
}

export function compareSourceData(current: SourceMovement[], stored: SourceMovement[]) {
  return {
    added: current.filter(item => !stored.some(old => old.id === item.id)),
    changed: current.filter(item => stored.some(old => old.id === item.id)),
    removed: stored.filter(item => !current.some(old => old.id === item.id))
  };
}
