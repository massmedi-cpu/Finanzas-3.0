import { callPersistenceGateway } from "../persistence/vercel-supabase-gateway";
import {
  refreshGoogleAccessToken,
} from "./google-oauth";
import type { GoogleAccessTokenProvider } from "./official-bank-source-reader";

export type GoogleConnectionStatus = {
  connected: boolean;
  google_subject: string;
  account_email: string;
  scopes: string[];
  source_file_id: string;
  source_file_name: string;
  connected_at: string;
  last_verified_at: string | null;
  updated_at: string;
};

export type GoogleConnectionDraft = {
  googleSubject: string;
  accountEmail: string;
  refreshToken: string;
  scopes: string[];
  sourceFileId: string;
  sourceFileName: string;
};

export type GoogleSourcePolicy = {
  configured: boolean;
  allowedEmail: string | null;
};

export class GoogleOauthGateway {
  async policy() {
    const result = await callPersistenceGateway<{ policy: GoogleSourcePolicy }>("source.google_policy");
    return result.policy;
  }

  async store(connection: GoogleConnectionDraft) {
    return callPersistenceGateway<{ connected: boolean }>("source.google_connection_store", {
      connection,
    });
  }

  async status() {
    const result = await callPersistenceGateway<{ connection: GoogleConnectionStatus | null }>(
      "source.google_connection_status",
    );
    return result.connection;
  }

  async getRefreshToken() {
    const result = await callPersistenceGateway<{ refreshToken: string }>(
      "source.google_refresh_token",
    );
    if (!result.refreshToken) throw new Error("google_oauth_refresh_token_unavailable");
    return result.refreshToken;
  }

  async markVerified() {
    await callPersistenceGateway<{ ok: true }>("source.google_mark_verified");
  }

  async disconnect() {
    return callPersistenceGateway<{ disconnected: boolean }>("source.google_disconnect");
  }
}

export class GatewayGoogleAccessTokenProvider implements GoogleAccessTokenProvider {
  constructor(
    private readonly oauth: GoogleOauthGateway,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async getAccessToken() {
    const refreshToken = await this.oauth.getRefreshToken();
    const refreshed = await refreshGoogleAccessToken({
      refreshToken,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    return refreshed.accessToken;
  }
}
