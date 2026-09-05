import { createSign } from "node:crypto";
import {
  GOOGLE_SOURCE_READONLY_SCOPES,
  type GoogleAccessTokenProvider,
} from "./official-bank-source-reader";

export const FINANCIAL_APP_GOOGLE_PROJECT_ID = "financial-app-507709";
export const FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL =
  "financial-app-reader@financial-app-507709.iam.gserviceaccount.com";
export const GOOGLE_SERVICE_ACCOUNT_ENV = "GOOGLE_SERVICE_ACCOUNT_JSON";
export const GOOGLE_SERVICE_ACCOUNT_TOKEN_URI = "https://oauth2.googleapis.com/token";

const JWT_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const ASSERTION_LIFETIME_SECONDS = 3600;
const TOKEN_CACHE_SKEW_SECONDS = 60;

type RawServiceAccountCredentials = {
  type?: unknown;
  project_id?: unknown;
  private_key_id?: unknown;
  private_key?: unknown;
  client_email?: unknown;
  client_id?: unknown;
  token_uri?: unknown;
};

export type GoogleServiceAccountCredentials = {
  projectId: string;
  privateKeyId: string;
  privateKey: string;
  clientEmail: string;
  clientId: string;
  tokenUri: string;
};

export class GoogleServiceAccountError extends Error {
  constructor(
    public readonly code:
      | "service_account_missing"
      | "service_account_invalid"
      | "service_account_token_request_failed"
      | "service_account_token_response_invalid",
    message: string,
  ) {
    super(message);
    this.name = "GoogleServiceAccountError";
  }
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseGoogleServiceAccountCredentials(raw: string): GoogleServiceAccountCredentials {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new GoogleServiceAccountError(
      "service_account_missing",
      `Falta ${GOOGLE_SERVICE_ACCOUNT_ENV}.`,
    );
  }

  let parsed: RawServiceAccountCredentials;
  try {
    parsed = JSON.parse(trimmed) as RawServiceAccountCredentials;
  } catch {
    throw new GoogleServiceAccountError(
      "service_account_invalid",
      "La credencial de la cuenta de servicio de Google no es JSON válido.",
    );
  }

  const type = asNonEmptyString(parsed.type);
  const projectId = asNonEmptyString(parsed.project_id);
  const privateKeyId = asNonEmptyString(parsed.private_key_id);
  const privateKey = asNonEmptyString(parsed.private_key);
  const clientEmail = asNonEmptyString(parsed.client_email);
  const clientId = asNonEmptyString(parsed.client_id);
  const tokenUri = asNonEmptyString(parsed.token_uri);

  if (
    type !== "service_account" ||
    projectId !== FINANCIAL_APP_GOOGLE_PROJECT_ID ||
    clientEmail !== FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL ||
    !privateKeyId ||
    !privateKey ||
    !clientId ||
    tokenUri !== GOOGLE_SERVICE_ACCOUNT_TOKEN_URI
  ) {
    throw new GoogleServiceAccountError(
      "service_account_invalid",
      "La credencial no pertenece a Financial App Reader o no cumple el contrato esperado.",
    );
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new GoogleServiceAccountError(
      "service_account_invalid",
      "La clave privada de la cuenta de servicio no tiene un formato PEM válido.",
    );
  }

  return { projectId, privateKeyId, privateKey, clientEmail, clientId, tokenUri };
}

export function getGoogleServiceAccountCredentialsFromEnvironment() {
  return parseGoogleServiceAccountCredentials(process.env[GOOGLE_SERVICE_ACCOUNT_ENV] ?? "");
}

function base64Url(value: string | Buffer) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer.toString("base64url");
}

export function buildGoogleServiceAccountAssertion(
  credentials: GoogleServiceAccountCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = base64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: credentials.privateKeyId }),
  );
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: GOOGLE_SOURCE_READONLY_SCOPES.join(" "),
      aud: credentials.tokenUri,
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_LIFETIME_SECONDS,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

type GoogleTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

export class GoogleServiceAccountAccessTokenProvider implements GoogleAccessTokenProvider {
  private cachedAccessToken: string | null = null;
  private cachedExpiresAtMs = 0;

  constructor(
    private readonly credentials: GoogleServiceAccountCredentials,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.cachedAccessToken && nowMs < this.cachedExpiresAtMs) {
      return this.cachedAccessToken;
    }

    const assertion = buildGoogleServiceAccountAssertion(
      this.credentials,
      Math.floor(nowMs / 1000),
    );
    const body = new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion });
    const response = await this.fetcher(this.credentials.tokenUri, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new GoogleServiceAccountError(
        "service_account_token_request_failed",
        `Google ha rechazado la autenticación de la cuenta de servicio con estado ${response.status}.`,
      );
    }

    const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
    const accessToken = asNonEmptyString(payload?.access_token);
    const tokenType = asNonEmptyString(payload?.token_type);
    const expiresIn =
      typeof payload?.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? Math.floor(payload.expires_in)
        : null;

    if (!accessToken || tokenType?.toLowerCase() !== "bearer" || !expiresIn || expiresIn <= 0) {
      throw new GoogleServiceAccountError(
        "service_account_token_response_invalid",
        "Google no ha devuelto un token de servicio válido.",
      );
    }

    this.cachedAccessToken = accessToken;
    this.cachedExpiresAtMs =
      nowMs + Math.max(1, expiresIn - TOKEN_CACHE_SKEW_SECONDS) * 1000;
    return accessToken;
  }
}
