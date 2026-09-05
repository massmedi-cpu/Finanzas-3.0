const GOOGLE_READONLY_SCOPES = new Set([
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function text(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid_${field}`);
}

function validateScopes(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length !== GOOGLE_READONLY_SCOPES.size) {
    throw new Error("invalid_google_oauth_scopes");
  }
  const scopes = new Set(value);
  if (scopes.size !== GOOGLE_READONLY_SCOPES.size) throw new Error("invalid_google_oauth_scopes");
  for (const scope of GOOGLE_READONLY_SCOPES) {
    if (!scopes.has(scope)) throw new Error("invalid_google_oauth_scopes");
  }
}

function validateConnection(connection: any) {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
    throw new Error("invalid_google_oauth_connection");
  }
  text(connection.googleSubject, "google_subject");
  text(connection.accountEmail, "account_email");
  text(connection.refreshToken, "refresh_token");
  validateScopes(connection.scopes);
  text(connection.sourceFileId, "source_file_id");
  text(connection.sourceFileName, "source_file_name");
}

export async function handleGoogleOauthAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "source.google_policy") {
    const rows = await sql`
      select allowed_email
      from financial_app.google_source_policy
      where id=true
    `;
    const allowedEmail = rows[0]?.allowed_email;
    return json({
      policy:
        typeof allowedEmail === "string" && allowedEmail
          ? { configured: true, allowedEmail }
          : { configured: false, allowedEmail: null },
    });
  }

  if (action === "source.google_connection_store") {
    validateConnection(payload.connection);
    const connection = payload.connection;
    const rows = await sql`
      select connection_id
      from financial_app.store_google_oauth_connection(
        ${connection.googleSubject},
        ${connection.accountEmail},
        ${connection.refreshToken},
        ${connection.scopes}::text[],
        ${connection.sourceFileId},
        ${connection.sourceFileName}
      )
    `;
    if (rows[0]?.connection_id !== true) throw new Error("google_oauth_store_failed");
    return json({ connected: true });
  }

  if (action === "source.google_connection_status") {
    const rows = await sql`
      select connected,google_subject,account_email,scopes,source_file_id,source_file_name,
             connected_at,last_verified_at,updated_at
      from financial_app.get_google_oauth_connection_status()
    `;
    return json({ connection: rows[0] ?? null });
  }

  if (action === "source.google_refresh_token") {
    const rows = await sql`
      select financial_app.get_google_oauth_refresh_token() as refresh_token
    `;
    const refreshToken = rows[0]?.refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) {
      return json({ error: "google_oauth_not_connected" }, 404);
    }
    return json({ refreshToken });
  }

  if (action === "source.google_mark_verified") {
    await sql`select financial_app.mark_google_oauth_verified()`;
    return json({ ok: true });
  }

  if (action === "source.google_disconnect") {
    const rows = await sql`
      select financial_app.disconnect_google_oauth_connection() as disconnected
    `;
    return json({ disconnected: rows[0]?.disconnected === true });
  }

  if (action === "test.google_oauth_vault") {
    if (environment !== "preview") return json({ error: "test_google_oauth_vault_preview_only" }, 403);

    const baselineRows = await sql`
      select
        (select count(*)::int from financial_app.google_oauth_connections) as connections,
        (select count(*)::int from vault.secrets where name='financial_app_google_refresh_token') as secrets,
        (select count(*)::int from financial_app.google_source_policy) as policies
    `;
    const baseline = baselineRows[0] ?? { connections: 0, secrets: 0, policies: 0 };
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        await tx`
          insert into financial_app.google_source_policy(id,allowed_email)
          values(true,'phase2-gateway@example.invalid')
          on conflict(id) do update set allowed_email=excluded.allowed_email,updated_at=now()
        `;

        const stored = await tx`
          select connection_id
          from financial_app.store_google_oauth_connection(
            '__phase2_gateway_google_subject__',
            'phase2-gateway@example.invalid',
            '__phase2_gateway_refresh_token__',
            ${Array.from(GOOGLE_READONLY_SCOPES)}::text[],
            '__phase2_gateway_source__',
            'Movimientos bancarios - fuente'
          )
        `;
        if (stored[0]?.connection_id !== true) throw new Error("test_google_oauth_store_failed");

        const tokenRows = await tx`
          select financial_app.get_google_oauth_refresh_token() as refresh_token
        `;
        if (tokenRows[0]?.refresh_token !== '__phase2_gateway_refresh_token__') {
          throw new Error("test_google_oauth_token_failed");
        }

        const statusRows = await tx`
          select account_email,source_file_id,cardinality(scopes)::int as scope_count
          from financial_app.get_google_oauth_connection_status()
        `;
        if (
          statusRows[0]?.account_email !== 'phase2-gateway@example.invalid' ||
          statusRows[0]?.source_file_id !== '__phase2_gateway_source__' ||
          statusRows[0]?.scope_count !== 2
        ) {
          throw new Error("test_google_oauth_status_failed");
        }

        await tx`select financial_app.mark_google_oauth_verified()`;
        const disconnected = await tx`
          select financial_app.disconnect_google_oauth_connection() as disconnected
        `;
        if (disconnected[0]?.disconnected !== true) throw new Error("test_google_oauth_disconnect_failed");

        verified = true;
        throw new Error("__ROLLBACK_GOOGLE_OAUTH_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_GOOGLE_OAUTH_TEST__") throw error;
    }

    const afterRows = await sql`
      select
        (select count(*)::int from financial_app.google_oauth_connections) as connections,
        (select count(*)::int from vault.secrets where name='financial_app_google_refresh_token') as secrets,
        (select count(*)::int from financial_app.google_oauth_connections where google_subject='__phase2_gateway_google_subject__') as test_connections,
        (select count(*)::int from financial_app.google_source_policy) as policies
    `;
    const after = afterRows[0] ?? {};
    const clean =
      after.connections === baseline.connections &&
      after.secrets === baseline.secrets &&
      after.policies === baseline.policies &&
      after.test_connections === 0;

    return json({ verified, clean });
  }

  return null;
}
