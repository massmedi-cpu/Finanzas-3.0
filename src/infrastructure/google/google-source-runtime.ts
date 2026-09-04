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
  allowedEmail: string;
};

export type GoogleOauthRedirectEnvironment = {
  explicitRedirectUri?: string;
  vercelEnvironment?: string;
  branchUrl?: string;
  productionUrl?: string;
  requestUrl?: string;
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

export function getGoogleSourceServerConfiguration(): GoogleSourceServerConfiguration {
  const values = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
    allowedEmail: process.env.GOOGLE_OAUTH_ALLOWED_EMAIL?.trim().toLowerCase() ?? "",
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new GoogleSourceRuntimeConfigurationError(missing);

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

export function createGoogleSourceRuntime(sourceFileId: string) {
  const configuration = getGoogleSourceServerConfiguration();
  const verifiedSourceFileId = sourceFileId.trim();
  if (!verifiedSourceFileId) {
    throw new GoogleSourceRuntimeConfigurationError(["sourceFileId"]);
  }

  const oauth = new GoogleOauthGateway();
  const accessTokens = new GatewayGoogleAccessTokenProvider(
    oauth,
    configuration.clientId,
    configuration.clientSecret,
  );
  const reader = new GoogleOfficialBankSourceReader(
    verifiedSourceFileId,
    accessTokens,
  );
  const synchronization = new SourceSyncService(new EdgeSourceSyncPersistence());
  return { configuration, oauth, accessTokens, reader, synchronization, sourceFileId: verifiedSourceFileId };
}
