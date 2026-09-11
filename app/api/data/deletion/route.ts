import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeletionReadiness = {
  canExecute?: unknown;
  destructiveOperationExecuted?: unknown;
  runtimeFoundation?: {
    commercialPolicyConfigured?: unknown;
    productionActivated?: unknown;
    selfServiceExecutionEndpointExposed?: unknown;
  };
  blockers?: unknown;
};

type DeletionReadinessGatewayResult = {
  readiness: DeletionReadiness;
};

type DeletionOperation = "prepare" | "confirm" | "cancel" | "execute";

type DeletionRequest = {
  operation?: unknown;
  requestKey?: unknown;
  intentId?: unknown;
  confirmationNonce?: unknown;
};

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "workspace_deletion_failed", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: SAFE_HEADERS,
      },
    );
  }

  console.error(
    "workspace-deletion-api-internal",
    error instanceof Error ? error.name : typeof error,
  );
  return Response.json(
    { error: "internal_error", code: null },
    { status: 500, headers: SAFE_HEADERS },
  );
}

function productionOnly() {
  if (process.env.VERCEL_ENV === "production") return null;
  return Response.json(
    {
      error: "workspace_deletion_production_only",
      code: "preview_production_deletion_forbidden",
    },
    { status: 403, headers: SAFE_HEADERS },
  );
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function operation(value: unknown): DeletionOperation | null {
  return value === "prepare" || value === "confirm" || value === "cancel" || value === "execute"
    ? value
    : null;
}

async function readReadiness(): Promise<DeletionReadiness> {
  const result = await callPersistenceGateway<DeletionReadinessGatewayResult>(
    "data.deletion_readiness_v1",
  );
  const readiness = result?.readiness;
  if (
    !readiness ||
    typeof readiness !== "object" ||
    Array.isArray(readiness) ||
    typeof readiness.canExecute !== "boolean" ||
    readiness.destructiveOperationExecuted !== false
  ) {
    throw new PersistenceGatewayError(
      "El gateway ha devuelto un readiness de borrado inválido.",
      503,
      "invalid_deletion_readiness_payload",
    );
  }
  return readiness;
}

function selfServiceActive(readiness: DeletionReadiness) {
  const runtime = readiness.runtimeFoundation;
  return Boolean(
    runtime &&
      runtime.commercialPolicyConfigured === true &&
      runtime.productionActivated === true &&
      runtime.selfServiceExecutionEndpointExposed === true,
  );
}

function unavailable(readiness: DeletionReadiness) {
  return Response.json(
    {
      error: "workspace_deletion_not_available",
      code: "workspace_deletion_commercial_policy_not_active",
      readiness,
    },
    { status: 409, headers: SAFE_HEADERS },
  );
}

export async function GET() {
  const blocked = productionOnly();
  if (blocked) return blocked;

  try {
    const readiness = await readReadiness();
    return Response.json(
      { readiness, available: selfServiceActive(readiness) },
      { status: 200, headers: SAFE_HEADERS },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const blocked = productionOnly();
  if (blocked) return blocked;

  let body: DeletionRequest;
  try {
    body = (await request.json()) as DeletionRequest;
  } catch {
    return Response.json(
      { error: "invalid_request", code: "invalid_json" },
      { status: 400, headers: SAFE_HEADERS },
    );
  }

  const requestedOperation = operation(body.operation);
  if (!requestedOperation) {
    return Response.json(
      { error: "invalid_request", code: "invalid_workspace_deletion_operation" },
      { status: 400, headers: SAFE_HEADERS },
    );
  }

  try {
    // Cancellation remains available for an already prepared/confirmed intent even if a
    // commercial kill-switch is turned off after preparation. It is non-destructive.
    if (requestedOperation === "cancel") {
      if (!validUuid(body.intentId)) {
        return Response.json(
          { error: "invalid_request", code: "invalid_workspace_deletion_intent_id" },
          { status: 400, headers: SAFE_HEADERS },
        );
      }
      const result = await callPersistenceGateway<Record<string, unknown>>(
        "data.deletion_cancel_v1",
        { intentId: body.intentId },
      );
      return Response.json(result, { status: 200, headers: SAFE_HEADERS });
    }

    // Critical fail-closed barrier: no prepare/confirm/execute reaches the mutating gateway
    // until policy + activation + exposed self-service are all explicitly true.
    const readiness = await readReadiness();
    if (!selfServiceActive(readiness)) return unavailable(readiness);

    if (requestedOperation === "prepare") {
      if (!validUuid(body.requestKey)) {
        return Response.json(
          { error: "invalid_request", code: "invalid_workspace_deletion_request_key" },
          { status: 400, headers: SAFE_HEADERS },
        );
      }
      const result = await callPersistenceGateway<Record<string, unknown>>(
        "data.deletion_prepare_v1",
        { requestKey: body.requestKey },
      );
      return Response.json(result, { status: 200, headers: SAFE_HEADERS });
    }

    if (requestedOperation === "confirm") {
      if (!validUuid(body.intentId) || !validUuid(body.confirmationNonce)) {
        return Response.json(
          { error: "invalid_request", code: "invalid_workspace_deletion_confirmation" },
          { status: 400, headers: SAFE_HEADERS },
        );
      }
      const result = await callPersistenceGateway<Record<string, unknown>>(
        "data.deletion_confirm_v1",
        { intentId: body.intentId, confirmationNonce: body.confirmationNonce },
      );
      return Response.json(result, { status: 200, headers: SAFE_HEADERS });
    }

    if (readiness.canExecute !== true) {
      return Response.json(
        {
          error: "workspace_deletion_not_ready",
          code: "workspace_deletion_confirmation_required",
          readiness,
        },
        { status: 409, headers: SAFE_HEADERS },
      );
    }
    if (!validUuid(body.intentId)) {
      return Response.json(
        { error: "invalid_request", code: "invalid_workspace_deletion_intent_id" },
        { status: 400, headers: SAFE_HEADERS },
      );
    }

    const result = await callPersistenceGateway<Record<string, unknown>>(
      "data.deletion_execute_v1",
      { intentId: body.intentId },
    );
    return Response.json(
      { ...result, receiptDelivery: "inline_json" },
      { status: 200, headers: SAFE_HEADERS },
    );
  } catch (error) {
    return apiError(error);
  }
}
