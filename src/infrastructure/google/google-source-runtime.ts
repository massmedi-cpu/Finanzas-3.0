import { randomBytes } from "node:crypto";
import { SourceSyncService } from "../../application/source-sync-service";
import { EdgeSourceSyncPersistence } from "../persistence/edge-source-sync-persistence";
import { GoogleOauthGateway, GatewayGoogleAccessTokenProvider } from "./google-oauth-gateway";
import { GoogleOfficialBankSourceReader } from "./official-bank-source-reader";

export const GOOGLE_OAUTH_STATE_COOKIE = "financial_app_google_oauth_state";
export const OFFICIAL_GOOGLE_SOURCE_NAME = "Movimientos bancarios - fuente";

export class GoogleSourceRuntimeConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Falta configuración privada de Google: ${missing.join(", ")}.`);
    this.name = "GoogleSourceRuntimeConfigurationError";
  }
}

export type GoogleSourceServerConfiguration = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  spreadsheetId: string;
  allowedEmail: string;
};

export function getGoogleSourceServerConfiguration(): GoogleSourceServerConfiguration {
  const values = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ?? "",
    spreadsheetId: process.env.GOOGLE_BANK_SOURCE_SPREADSHEET_ID?.trim() ?? "",
    allowedEmail: process.env.GOOGLE_OAUTH_ALLOWED_EMAIL?.trim().toLowerCase() ?? "",
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new GoogleSourceRuntimeConfigurationError(missing);

  const redirect = new URL(values.redirectUri);
  if (redirect.protocol !== "https:") {
    throw new GoogleSourceRuntimeConfigurationError(["redirectUri_https"]);
  }
  if (!values.allowedEmail.includes("@")) {
    throw new GoogleSourceRuntimeConfigurationError(["allowedEmail"]);
  }
  return values;
}

export function googleSourceServerConfigured() {
  try {
    getGoogleSourceServerConfiguration();
    return true;
  } catch {
    return false;
  }
}

export function createGoogleOauthState() {
  return randomBytes(32).toString("hex");
}

export function createGoogleSourceRuntime() {
  const configuration = getGoogleSourceServerConfiguration();
  const oauth = new GoogleOauthGateway();
  const accessTokens = new GatewayGoogleAccessTokenProvider(
    oauth,
    configuration.clientId,
    configuration.clientSecret,
  );
  const reader = new GoogleOfficialBankSourceReader(
    configuration.spreadsheetId,
    accessTokens,
  );
  const synchronization = new SourceSyncService(new EdgeSourceSyncPersistence());
  return { configuration, oauth, accessTokens, reader, synchronization };
}
