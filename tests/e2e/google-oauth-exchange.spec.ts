import { expect, test } from "@playwright/test";
import {
  GoogleOauthError,
  exchangeGoogleAuthorizationCode,
} from "../../src/infrastructure/google/google-oauth";

function jsonResponse(status: number, payload: unknown) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
}

const INPUT = {
  code: "phase2-authorization-code",
  clientId: "phase2-client-id",
  clientSecret: "phase2-client-secret",
  redirectUri: "https://preview.example.test/api/source/google/callback",
};

const READONLY_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

test("un refresh token permanente puede completar el intercambio OAuth", async () => {
  const fetcher = jsonResponse(200, {
    access_token: "phase2-access-token",
    refresh_token: "phase2-refresh-token",
    expires_in: 3600,
    scope: READONLY_SCOPES,
    token_type: "Bearer",
  }) as typeof fetch;

  await expect(exchangeGoogleAuthorizationCode({ ...INPUT, fetcher })).resolves.toEqual({
    accessToken: "phase2-access-token",
    refreshToken: "phase2-refresh-token",
    expiresInSeconds: 3600,
    scopes: READONLY_SCOPES.split(" "),
  });
});

test("un refresh token temporal se rechaza antes de guardarlo en Vault", async () => {
  const fetcher = jsonResponse(200, {
    access_token: "phase2-access-token",
    refresh_token: "phase2-refresh-token",
    refresh_token_expires_in: 604800,
    expires_in: 3600,
    scope: READONLY_SCOPES,
    token_type: "Bearer",
  }) as typeof fetch;

  await expect(
    exchangeGoogleAuthorizationCode({ ...INPUT, fetcher }),
  ).rejects.toMatchObject<Partial<GoogleOauthError>>({
    name: "GoogleOauthError",
    code: "google_refresh_token_temporary",
  });
});

test("una caducidad temporal mal formada se trata como respuesta OAuth inválida", async () => {
  const fetcher = jsonResponse(200, {
    access_token: "phase2-access-token",
    refresh_token: "phase2-refresh-token",
    refresh_token_expires_in: "604800",
    expires_in: 3600,
    scope: READONLY_SCOPES,
    token_type: "Bearer",
  }) as typeof fetch;

  await expect(
    exchangeGoogleAuthorizationCode({ ...INPUT, fetcher }),
  ).rejects.toMatchObject<Partial<GoogleOauthError>>({
    name: "GoogleOauthError",
    code: "google_token_response_invalid",
  });
});
