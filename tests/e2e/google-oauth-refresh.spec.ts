import { expect, test } from "@playwright/test";
import {
  GoogleOauthError,
  refreshGoogleAccessToken,
} from "../../src/infrastructure/google/google-oauth";

function jsonResponse(status: number, payload: unknown) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
}

const INPUT = {
  refreshToken: "phase2-refresh-token",
  clientId: "phase2-client-id",
  clientSecret: "phase2-client-secret",
};

test("un refresh token revocado exige volver a autorizar Google", async () => {
  const fetcher = jsonResponse(400, { error: "invalid_grant" }) as typeof fetch;

  await expect(
    refreshGoogleAccessToken({ ...INPUT, fetcher }),
  ).rejects.toMatchObject<Partial<GoogleOauthError>>({
    name: "GoogleOauthError",
    code: "google_reauthorization_required",
  });
});

test("un fallo temporal al renovar Google no se confunde con una revocación", async () => {
  const fetcher = jsonResponse(503, { error: "temporarily_unavailable" }) as typeof fetch;

  await expect(
    refreshGoogleAccessToken({ ...INPUT, fetcher }),
  ).rejects.toMatchObject<Partial<GoogleOauthError>>({
    name: "GoogleOauthError",
    code: "google_refresh_failed",
  });
});

test("la renovación válida solo devuelve el access token efímero y su caducidad", async () => {
  const fetcher = jsonResponse(200, {
    access_token: "phase2-access-token",
    expires_in: 3600,
    token_type: "Bearer",
  }) as typeof fetch;

  const result = await refreshGoogleAccessToken({ ...INPUT, fetcher });

  expect(result).toEqual({
    accessToken: "phase2-access-token",
    expiresInSeconds: 3600,
  });
  expect("refreshToken" in result).toBe(false);
});
