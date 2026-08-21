export const SOURCE_HEADERS = [
  "ID origen",
  "Fecha",
  "Hora",
  "Producto o cuenta",
  "Entidad",
  "Identificador",
  "Tipo de producto",
  "Tipo de movimiento",
  "Categoría",
  "Subcategoría",
  "Concepto original",
  "Concepto normalizado",
  "Comercio o contraparte",
  "Importe (€)",
  "Saldo (€)",
  "Canal",
  "Cuenta de origen",
  "Cuenta de destino",
  "Conciliado",
  "Revisar",
  "Notas",
  "Fuente",
] as const;

export type SourceHeader = (typeof SOURCE_HEADERS)[number];
export type SourceRow = Record<SourceHeader, string | null>;

export interface SourceSnapshot {
  sheetName: string;
  sourceId: string;
  sourceHash: string;
  raw: SourceRow;
}
