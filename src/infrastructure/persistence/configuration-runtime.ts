import {
  ConfigurationService,
  cryptoIdentityProvider,
  systemClock,
  type Clock,
  type IdentityProvider,
} from "../../application/configuration-service";
import {
  PostgresAccountRepository,
  PostgresCategoryRepository,
} from "./postgres-configuration-repositories";
import type { SqlExecutor } from "./sql-executor";

/**
 * Composition root de Configuración.
 *
 * Recibe una conexión SQL ya autenticada y exclusivamente server-side. No
 * conoce secretos ni los lee del navegador. Esta separación permite cambiar
 * el transporte Vercel -> PostgreSQL sin contaminar dominio/aplicación.
 */
export function createConfigurationService(
  sql: SqlExecutor,
  dependencies: {
    identities?: IdentityProvider;
    clock?: Clock;
  } = {},
) {
  return new ConfigurationService(
    new PostgresAccountRepository(sql),
    new PostgresCategoryRepository(sql),
    dependencies.identities ?? cryptoIdentityProvider,
    dependencies.clock ?? systemClock,
  );
}
