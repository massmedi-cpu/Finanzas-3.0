export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Punto de entrada del sincronizador.
 * La hoja origen siempre sera tratada como solo lectura.
 */
export async function syncGoogleSheets(): Promise<SyncResult> {
  return {
    added: 0,
    updated: 0,
    removed: 0,
  };
}
