import { GOOGLE_SOURCE_READONLY_SCOPES } from "./official-bank-source-reader";

export const GOOGLE_OAUTH_IDENTITY_SCOPES = ["openid", "email"] as const;
export const GOOGLE_OAUTH_ALL_SCOPES = [
  ...GOOGLE_OAUTH_IDENTITY_SCOPES,
  ...GOOGLE_SOURCE_READONLY_SCOPES,
] as const;

export class GoogleOauthError extends Error {
  constructor(
    public readonly code:
      | "invalid_oauth_configuration"
      | "invalid_oauth_state"
      | "google_token_exchange_failed"
      | "google_refresh_failed"
      | "google_reauthorization_required"
      | "google_token_response_invalid"
      | "google_refresh_token_missing"
      | "google_refresh_token_temporary"
      | "google_required_scope_missing"
      | "google_userinfo_failed"
      | "google_userinfo_invalid",
    message: string,
  ) {
    super(message);
    this.name = "GoogleOauthError";
  }
}

function requireText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new GoogleOauthError(
      "invalid_oauth_configuration",
      `Falta la configuración OAuth obligatoria “${field}”.`,
    );
  }
  return normalized;
}

function requireHttpsUrl(value: string, field: string) {
  const url = new URL(requireText(value, field));
  if (url.protocol !== "https:") {
    throw new GoogleOauthError(
      "invalid_oauth_configuration",
      `“${field}” debe usar HTTPS.`,
    );
  }
  return url.toString();
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const clientId = requireText(input.clientId, "clientId");
  const redirectUri = requireHttpsUrl(input.redirectUri, "redirectUri");
  const state = requireText(input.state, "state");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_ALL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

export function validateGoogleOauthState(expected: string, received: string | null) {
  if (!expected || !received || expected.length !== received.length) {
    throw new GoogleOauthError("invalid_oauth_state", "El estado OAuth no coincide.");
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  if (difference !== 0) {
    throw new GoogleOauthError("invalid_oauth_state", "El estado OAuth no coincide.");
  }
}

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
  error?: unknown;
};

export type GoogleAuthorizationTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
};

function parseScopes(value: unknown) {
  if (typeof value !== "string") return [];
  return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

function assertRequiredResourceScopes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  for (const scope of GOOGLE_SOURCE_READONLY_SCOPES) {
    if (!granted.has(scope)) {
      throw new GoogleOauthError(
        "google_required_scope_missing",
        `Google no ha concedido el permiso de solo lectura requerido: ${scope}.`,
      );
    }
  }
}

async function postTokenRequest(
  body: URLSearchParams,
  fetcher: typeof fetch,
  mode: "exchange" | "refresh",
): Promise<TokenResponse> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !payload) {
    if (mode === "refresh" && payload?.error === "invalid_grant") {
      throw new GoogleOauthError(
        "google_reauthorization_required",
        "Google ha revocado o invalidado la autorización; es necesario conectar de nuevo.",
      );
    }
    throw new GoogleOauthError(
      mode === "refresh" ? "google_refresh_failed" : "google_token_exchange_failed",
      mode === "refresh"
        ? "Google no ha podido renovar temporalmente la autorización OAuth."
        : "Google ha rechazado el intercambio OAuth.",
    );
  }
  return payload;
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}): Promise<GoogleAuthorizationTokens> {
  const code = requireText(input.code, "code");
  const clientId = requireText(input.clientId, "clientId");
  const clientSecret = requireText(input.clientSecret, "clientSecret");
  const redirectUri = requireHttpsUrl(input.redirectUri, "redirectUri");
  const payload = await postTokenRequest(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    input.fetcher ?? fetch,
    "exchange",
  );

  if (
    typeof payload.access_token !== "string" ||
    !payload.access_token ||
    typeof payload.refresh_token !== "string" ||
    !payload.refresh_token ||
    typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0 ||
    payload.token_type !== "Bearer"
  ) {
    if (typeof payload.refresh_token !== "string" || !payload.refresh_token) {
      throw new GoogleOauthError(
        "google_refresh_token_missing",
        "Google no ha entregado refresh token; la conexión no se guardará.",
      );
    }
    throw new GoogleOauthError(
      "google_token_response_invalid",
      "La respuesta OAuth de Google no tiene el formato esperado.",
    );
  }

  if (payload.refresh_token_expires_in !== undefined) {
    if (
      typeof payload.refresh_token_expires_in !== "number" ||
      !Number.isFinite(payload.refresh_token_expires_in) ||
      payload.refresh_token_expires_in <= 0
    ) {
      throw new GoogleOauthError(
        "google_token_response_invalid",
        "Google ha devuelto una caducidad de refresh token no válida.",
      );
    }
    throw new GoogleOauthError(
      "google_refresh_token_temporary",
      "Google ha entregado un refresh token temporal; la conexión no se guardará. Configura la aplicación OAuth como In production y vuelve a autorizar.",
    );
  }

  const scopes = parseScopes(payload.scope);
  assertRequiredResourceScopes(scopes);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresInSeconds: payload.expires_in,
    scopes,
  };
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
}) {
  const payload = await postTokenRequest(
    new URLSearchParams({
      refresh_token: requireText(input.refreshToken, "refreshToken"),
      client_id: requireText(input.clientId, "clientId"),
      client_secret: requireText(input.clientSecret, "clientSecret"),
      grant_type: "refresh_token",
    }),
    input.fetcher ?? fetch,
    "refresh",
  );

  if (
    typeof payload.access_token !== "string" ||
    !payload.access_token ||
    typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0 ||
    payload.token_type !== "Bearer"
  ) {
    throw new GoogleOauthError(
      "google_token_response_invalid",
      "Google ha devuelto un access token renovado no válido.",
    );
  }

  return {
    accessToken: payload.access_token,
    expiresInSeconds: payload.expires_in,
  };
}

export type GoogleUserInfo = {
  subject: string;
  email: string;
};

export async function fetchGoogleUserInfo(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleUserInfo> {
  const response = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: {
      authorization: `Bearer ${requireText(accessToken, "accessToken")}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { sub?: unknown; email?: unknown; email_verified?: unknown }
    | null;

  if (!response.ok || !payload) {
    throw new GoogleOauthError("google_userinfo_failed", "No se ha podido verificar la identidad de Google.");
  }
  if (
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    typeof payload.email !== "string" ||
    !payload.email.trim() ||
    payload.email_verified !== true
  ) {
    throw new GoogleOauthError(
      "google_userinfo_invalid",
      "Google no ha devuelto una identidad de correo verificada.",
    );
  }
  return { subject: payload.sub.trim(), email: payload.email.trim().toLowerCase() };
}
