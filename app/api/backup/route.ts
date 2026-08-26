import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { API_NO_STORE_HEADERS, apiError, apiFailure, apiJson, apiUnauthorized, publicApiErrorCode } from "@/lib/api/response";
import { BACKUP_MAX_BYTES, canExecuteRestore, parseBackupCommand } from "@/lib/financial/backup-recovery";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const { data, error } = await supabase.rpc("financial_app_backup_export");
  if (error || !data) return apiFailure("backup.export", error, "backup_unavailable");
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      ...API_NO_STORE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-app-private-backup-${day}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  const length = Number(request.headers.get("content-length") || 0);
  if (length > BACKUP_MAX_BYTES) return apiError("backup_too_large", 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > BACKUP_MAX_BYTES) return apiError("backup_too_large", 413);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const command = parseBackupCommand(body);
  if (!command) return apiError("invalid_backup_command");
  if (command.action === "restore" && !canExecuteRestore(command)) return apiError("restore_confirmation_or_fingerprint_invalid");
  const rpc = command.action === "restore"
    ? supabase.rpc("financial_app_backup_restore", {p_backup:command.backup,p_expected_fingerprint:command.expectedFingerprint!,p_confirmation:command.confirmation!})
    : supabase.rpc("financial_app_backup_preview", { p_backup: command.backup });
  const { data, error } = await rpc;
  if (error || !data) {
    const publicCode = publicApiErrorCode(error, "backup_operation_failed");
    return apiFailure("backup.operation", error, "backup_operation_failed", publicCode === "backup_not_safe" ? 409 : 400);
  }
  return apiJson(data);
}
