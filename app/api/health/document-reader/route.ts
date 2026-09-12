import {
  FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_DOCUMENT_READONLY_SCOPES,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  getGoogleServiceAccountCredentialsFromEnvironment,
} from "../../../../src/infrastructure/google/google-service-account";
import { OFFICIAL_GOOGLE_SOURCE_FILE_ID } from "../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
};

function failed(error: string) {
  return Response.json(
    {
      status: "failed",
      reader: "financial_app_reader",
      managed: true,
      error,
    },
    { status: 503, headers },
  );
}

function serviceAccountFailure(error: unknown) {
  if (!(error instanceof GoogleServiceAccountError)) return "managed_reader_unavailable";

  switch (error.code) {
    case "service_account_missing":
      return "managed_reader_missing";
    case "service_account_invalid":
      return "managed_reader_invalid";
    case "service_account_scope_invalid":
      return "managed_reader_scope_invalid";
    case "service_account_token_request_failed":
      return "managed_reader_auth_failed";
    case "service_account_token_response_invalid":
      return "managed_reader_token_invalid";
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json(
      { status: "not_available" },
      { status: 404, headers },
    );
  }

  try {
    const credentials = getGoogleServiceAccountCredentialsFromEnvironment();
    if (credentials.clientEmail !== FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL) {
      return failed("managed_reader_identity_mismatch");
    }

    const accessTokens = new GoogleServiceAccountAccessTokenProvider(
      credentials,
      fetch,
      Date.now,
      GOOGLE_DOCUMENT_READONLY_SCOPES,
    );
    const accessToken = await accessTokens.getAccessToken();

    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(OFFICIAL_GOOGLE_SOURCE_FILE_ID)}?fields=id&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    if (!driveResponse.ok) {
      return failed("managed_reader_drive_unavailable");
    }

    const driveFile = (await driveResponse.json().catch(() => null)) as { id?: unknown } | null;
    if (driveFile?.id !== OFFICIAL_GOOGLE_SOURCE_FILE_ID) {
      return failed("managed_reader_drive_contract_invalid");
    }

    return Response.json(
      {
        status: "ok",
        reader: "financial_app_reader",
        managed: true,
        identity: FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
        credential: "valid",
        googleAuth: "ok",
        driveRead: "ok",
      },
      { status: 200, headers },
    );
  } catch (error) {
    return failed(serviceAccountFailure(error));
  }
}
