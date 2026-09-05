import { getVercelOidcToken } from "@vercel/oidc";

const SUPABASE_GATEWAY_URL =
  "https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway";
const SUPABASE_GATEWAY_REGION = "eu-west-3";

export class PersistenceGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PersistenceGatewayError";
  }
}

export async function callPersistenceGateway<Result>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Result> {
  const oidcToken = await getVercelOidcToken({
    project: "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo",
    team: "team_xrSskbkRKwQkyYc0vvLVGUnb",
    expirationBufferMs: 60_000,
  });

  if (!oidcToken) {
    throw new PersistenceGatewayError("Vercel no ha proporcionado identidad OIDC.", 503, "oidc_unavailable");
  }

  const response = await fetch(SUPABASE_GATEWAY_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidcToken}`,
      "content-type": "application/json",
      "x-region": SUPABASE_GATEWAY_REGION,
    },
    body: JSON.stringify({ action, payload }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | (Result & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new PersistenceGatewayError(
      "El gateway de persistencia ha rechazado la operación.",
      response.status,
      body?.error,
    );
  }

  if (body.error) {
    throw new PersistenceGatewayError(
      "La operación de persistencia no se ha completado.",
      response.status,
      body.error,
    );
  }

  return body;
}
