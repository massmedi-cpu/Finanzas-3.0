export type SqlRow = Record<string, unknown>;

export interface SqlQueryResult<Row extends SqlRow = SqlRow> {
  rows: Row[];
  rowCount: number;
}

/**
 * Puerto mínimo hacia PostgreSQL.
 *
 * La infraestructura concreta (Vercel + Supabase) deberá implementar este
 * contrato únicamente en servidor. El dominio no conoce URLs, claves ni SDKs.
 */
export interface SqlExecutor {
  query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;

  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
}

export class PersistenceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceInvariantError";
  }
}
