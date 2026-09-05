import { createVerify, generateKeyPairSync } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  FINANCIAL_APP_GOOGLE_PROJECT_ID,
  FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  parseGoogleServiceAccountCredentials,
} from "../../src/infrastructure/google/google-service-account";
import {
  OFFICIAL_GOOGLE_SOURCE_FILE_ID,
  getGoogleSourceAuthMode,
  resolveGoogleSourceConnection,
} from "../../src/infrastructure/google/google-source-runtime";
import { GOOGLE_SOURCE_READONLY_SCOPES } from "../../src/infrastructure/google/official-bank-source-reader";

function generateCredentials() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const raw = JSON.stringify({
    type: "service_account",
    project_id: FINANCIAL_APP_GOOGLE_PROJECT_ID,
    private_key_id: "test-key-id",
    private_key: privateKeyPem,
    client_email: FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
    client_id: "116534793741269398387",
    token_uri: GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
  });
  return { raw, publicKeyPem };
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("la credencial de servicio queda anclada al proyecto y a Financial App Reader", () => {
  const { raw } = generateCredentials();
  const valid = parseGoogleServiceAccountCredentials(raw);
  expect(valid.projectId).toBe(FINANCIAL_APP_GOOGLE_PROJECT_ID);
  expect(valid.clientEmail).toBe(FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL);

  const wrongProject = JSON.stringify({ ...JSON.parse(raw), project_id: "otro-proyecto" });
  expect(() => parseGoogleServiceAccountCredentials(wrongProject)).toThrow(GoogleServiceAccountError);
});

test("el JWT de servicio solicita solo los scopes read-only y reutiliza el token mientras es válido", async () => {
  const { raw, publicKeyPem } = generateCredentials();
  const credentials = parseGoogleServiceAccountCredentials(raw);
  let calls = 0;
  let nowMs = Date.UTC(2026, 8, 5, 11, 0, 0);

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    expect(String(input)).toBe(GOOGLE_SERVICE_ACCOUNT_TOKEN_URI);
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");

    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = body.get("assertion") ?? "";
    const [encodedHeader, encodedClaims, encodedSignature] = assertion.split(".");
    expect(encodedHeader).toBeTruthy();
    expect(encodedClaims).toBeTruthy();
    expect(encodedSignature).toBeTruthy();

    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "test-key-id" });
    expect(claims.iss).toBe(FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL);
    expect(claims.scope).toBe(GOOGLE_SOURCE_READONLY_SCOPES.join(" "));
    expect(claims.aud).toBe(GOOGLE_SERVICE_ACCOUNT_TOKEN_URI);
    expect(claims.exp - claims.iat).toBe(3600);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedClaims}`);
    verifier.end();
    expect(verifier.verify(publicKeyPem, Buffer.from(encodedSignature, "base64url"))).toBe(true);

    return new Response(
      JSON.stringify({ access_token: `service-token-${calls}`, expires_in: 3600, token_type: "Bearer" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const provider = new GoogleServiceAccountAccessTokenProvider(credentials, fetcher, () => nowMs);
  expect(await provider.getAccessToken()).toBe("service-token-1");
  expect(await provider.getAccessToken()).toBe("service-token-1");
  expect(calls).toBe(1);

  nowMs += 3_541_000;
  expect(await provider.getAccessToken()).toBe("service-token-2");
  expect(calls).toBe(2);
});

test("la cuenta de servicio sustituye OAuth operativamente sin selección manual de archivo", async () => {
  const { raw } = generateCredentials();
  const previousServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const previousClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  try {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = raw;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "legacy-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "legacy-secret";

    expect(getGoogleSourceAuthMode()).toBe("service-account");
    const connection = await resolveGoogleSourceConnection();
    expect(connection).toMatchObject({
      authMode: "service-account",
      accountEmail: FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
      sourceFileId: OFFICIAL_GOOGLE_SOURCE_FILE_ID,
      sourceFileName: "Movimientos bancarios - fuente",
      readonly: true,
      managed: true,
    });
  } finally {
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_JSON", previousServiceAccount);
    restoreEnvironment("GOOGLE_OAUTH_CLIENT_ID", previousClientId);
    restoreEnvironment("GOOGLE_OAUTH_CLIENT_SECRET", previousClientSecret);
  }
});
