import {
  ConfigurationService,
  cryptoIdentityProvider,
  systemClock,
  type Clock,
  type IdentityProvider,
} from "../../application/configuration-service";
import {
  EdgeAccountRepository,
  EdgeCategoryRepository,
} from "./edge-configuration-repositories";

/**
 * Composition root de Configuración para Vercel.
 *
 * La identidad entre Vercel y Supabase se obtiene mediante OIDC efímero. No
 * existe contraseña ni service_role en el navegador ni en el repositorio.
 */
export function createEdgeConfigurationService(
  dependencies: {
    identities?: IdentityProvider;
    clock?: Clock;
  } = {},
) {
  return new ConfigurationService(
    new EdgeAccountRepository(),
    new EdgeCategoryRepository(),
    dependencies.identities ?? cryptoIdentityProvider,
    dependencies.clock ?? systemClock,
  );
}
