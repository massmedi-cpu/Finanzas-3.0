import { randomBytes } from "node:crypto";
import { SourceSyncService } from "../../application/source-sync-service";
import { EdgeSourceSyncPersistence } from "../persistence/edge-source-sync-persistence";
import { GoogleOauthGateway, GatewayGoogleAccessTokenProvider } from "./google-oauth-gateway";
import {
  FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_ENV,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  getGoogleServiceAccountCredentialsFromEnvironment,
  type GoogleServiceAccountCredentials,
} from "./google-service-account";
import { GoogleOfficialBankSourceReader } from "./official-bank-source-reader";

export const GOOGLE_OAUTH_STATE_COOKIE = "financial_app_google_oauth_state";
export const OFFICIAL_GOOGLE_SOURCE_NAME = "Movimientos bancarios - fuente";
export const OFFICIAL_GOOGLE_SOURCE_FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8";

export type GoogleSourceAuthMode = "service-account" | "oauth";

export class GoogleSourceRuntimeConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Falta configuración privada de Google: ${missing.join(", ")}.`);
    this.name = "GoogleSourceRuntimeConfigurationError";
  }
}

export class GoogleSourceConnectionContractError extends Error {
  constructor() {
    super("La conexión Google no coincide con el contrato de la fuente oficial.");
    this.name = "GoogleSourceConnectionContractError";
  }
}

export type GoogleSourceServerConfiguration = {
  clientId: string;
  clientSecret: string;
};

export type GoogleOauthRedirectEnvironment = {
  explicitRedirectUri?: string;
  vercelEnvironment?: string;
  branchUrl?: string;
  productionUrl?: string;
  requestUrl?: string;
};

export type ResolvedGoogleSourceConnection = {
  authMode: GoogleSourceAuthMode;
  accountEmail: string;
  sourceFileName: string;
  sourceFileId: string;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  readonly: true;
  managed: boolean;
};

function requireHttpsUrl(value: string, field: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new GoogleSourceRuntimeConfigurationError([`${field}_https`]);
  }
  return url.toString();
}

function vercelHostUrl(host: string, field: string) {
  const normalized = host.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!normalized) throw new GoogleSourceRuntimeConfigurationError([field]);
  return `https://${normalized}`;
}

export function buildGoogleOauthRedirectUri(input: GoogleOauthRedirectEnvironment) {
  const explicit = input.explicitRedirectUri?.trim();
  if (explicit) return requireHttpsUrl(explicit, "redirectUri");

  if (input.vercelEnvironment === "preview") {
    const branchUrl = input.branchUrl?.trim();
    if (!branchUrl) throw new GoogleSourceRuntimeConfigurationError(["redirectUri"]);
    return new URL("/api/source/google/callback", vercelHostUrl(branchUrl, "branchUrl")).toString();
  }

  if (input.vercelEnvironment === "production") {
    const productionUrl = input.productionUrl?.trim();
    if (!productionUrl) throw new GoogleSourceRuntimeConfigurationError(["redirectUri"]);
    return new URL("/api/source/google/callback", vercelHostUrl(productionUrl, "productionUrl")).toString();
  }

  if (input.requestUrl?.trim()) {
    const requestUrl = new URL(input.requestUrl);
    if (requestUrl.protocol === "https:") {
      return new URL("/api/source/google/callback", requestUrl).toString();
    }
  }

  throw new GoogleSourceRuntimeConfigurationError(["redirectUri"]);
}

export function getGoogleOauthRedirectUri(requestUrl?: string) {
  return buildGoogleOauthRedirectUri({
    explicitRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    vercelEnvironment: process.env.VERCEL_ENV,
    branchUrl: process.env.VERCEL_BRANCH_URL,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    requestUrl,
  });
}

export function getGoogleSourceAuthMode(): GoogleSourceAuthMode {
  return process.env[GOOGLE_SERVICE_ACCOUNT_ENV]?.trim() ? "service-account" : "oauth";
}

export function getGoogleSourceServerConfiguration(): GoogleSourceServerConfiguration {
  const values = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new GoogleSourceRuntimeConfigurationError(missing);
  return values;
}

export function getGoogleServiceAccountConfiguration(): GoogleServiceAccountCredentials {
  try {
    return getGoogleServiceAccountCredentialsFromEnvironment();
  } catch (error) {
    if (error instanceof GoogleServiceAccountError) {
      throw new GoogleSourceRuntimeConfigurationError([
        error.code === "service_account_missing" ? "serviceAccountJson" : "serviceAccountJson_invalid",
      ]);
    }
    throw error;
  }
}

export async function getGoogleAllowedAccountEmail(oauth = new GoogleOauthGateway()) {
  const policy = await oauth.policy();
  const allowedEmail = policy.allowedEmail?.trim().toLowerCase() ?? "";
  if (!policy.configured || !allowedEmail || !allowedEmail.includes("@")) {
    throw new GoogleSourceRuntimeConfigurationError(["allowedEmail"]);
  }
  return allowedEmail;
}

export function googleSourceServerConfigured() {
  try {
    if (getGoogleSourceAuthMode() === "service-account") {
      getGoogleServiceAccountConfiguration();
    } else {
      getGoogleSourceServerConfiguration();
    }
    return true;
  } catch {
    return false;
  }
}

export function createGoogleOauthState() {
  return randomBytes(32).toString("hex");
}

export async function resolveGoogleSourceConnection(
  oauth = new GoogleOauthGateway(),
): Promise<ResolvedGoogleSourceConnection | null> {
  if (getGoogleSourceAuthMode() === "service-account") {
    const credentials = getGoogleServiceAccountConfiguration();
    if (credentials.clientEmail !== FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL) {
      throw new GoogleSourceConnectionContractError();
    }
    return {
      authMode: "service-account",
      accountEmail: credentials.clientEmail,
      sourceFileName: OFFICIAL_GOOGLE_SOURCE_NAME,
      sourceFileId: OFFICIAL_GOOGLE_SOURCE_FILE_ID,
      connectedAt: null,
      lastVerifiedAt: null,
      readonly: true,
      managed: true,
    };
  }

  getGoogleSourceServerConfiguration();
  const allowedEmail = await getGoogleAllowedAccountEmail(oauth);
  const connection = await oauth.status();
  if (!connection) return null;
  if (
    connection.account_email.toLowerCase() !== allowedEmail ||
    connection.source_file_name !== OFFICIAL_GOOGLE_SOURCE_NAME
  ) {
    throw new GoogleSourceConnectionContractError();
  }
  return {
    authMode: "oauth",
    accountEmail: connection.account_email,
    sourceFileName: connection.source_file_name,
    sourceFileId: connection.source_file_id,
    connectedAt: connection.connected_at,
    lastVerifiedAt: connection.last_verified_at,
    readonly: true,
    managed: false,
  };
}

export function createGoogleSourceRuntime(sourceFileId?: string) {
  const authMode = getGoogleSourceAuthMode();
  const verifiedSourceFileId =
    (sourceFileId ?? (authMode === "service-account" ? OFFICIAL_GOOGLE_SOURCE_FILE_ID : "")).trim();
  if (!verifiedSourceFileId) {
    throw new GoogleSourceRuntimeConfigurationError(["sourceFileId"]);
  }

  let configuration: GoogleSourceServerConfiguration | GoogleServiceAccountCredentials;
  let oauth: GoogleOauthGateway | null = null;
  let accessTokens: GatewayGoogleAccessTokenProvider | GoogleServiceAccountAccessTokenProvider;

  if (authMode === "service-account") {
    configuration = getGoogleServiceAccountConfiguration();
    accessTokens = new GoogleServiceAccountAccessTokenProvider(configuration);
  } else {
    configuration = getGoogleSourceServerConfiguration();
    oauth = new GoogleOauthGateway();
    accessTokens = new GatewayGoogleAccessTokenProvider(
      oauth,
      configuration.clientId,
      configuration.clientSecret,
    );
  }

  const reader = new GoogleOfficialBankSourceReader(verifiedSourceFileId, accessTokens);
  const synchronization = new SourceSyncService(new EdgeSourceSyncPersistence());
  return {
    authMode,
    configuration,
    oauth,
    accessTokens,
    reader,
    synchronization,
    sourceFileId: verifiedSourceFileId,
  };
}
