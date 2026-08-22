import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import {
  BACKUP_MAX_BYTES,
  canExecuteRestore,
  parseBackupCommand,
} from "@/lib/financial/backup-recovery";

const noStore = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getAuthorizedClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("financial_app_backup_export");
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message || "backup_unavailable" },
      { status: 400 },
    );
  }

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      ...noStore,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-app-private-backup-${day}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > BACKUP_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "backup_too_large" }, { status: 413 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > BACKUP_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "backup_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const command = parseBackupCommand(body);
  if (!command) {
    return NextResponse.json({ ok: false, error: "invalid_backup_command" }, { status: 400 });
  }

  if (command.action === "restore" && !canExecuteRestore(command)) {
    return NextResponse.json(
      { ok: false, error: "restore_confirmation_or_fingerprint_invalid" },
      { status: 400 },
    );
  }

  const rpc =
    command.action === "restore"
      ? supabase.rpc("financial_app_backup_restore", {
          p_backup: command.backup,
          p_expected_fingerprint: command.expectedFingerprint!,
          p_confirmation: command.confirmation!,
        })
      : supabase.rpc("financial_app_backup_preview", { p_backup: command.backup });

  const { data, error } = await rpc;
  if (error || !data) {
    const errorMessage = error?.message || "backup_operation_failed";
    const status = errorMessage.includes("backup_not_safe") ? 409 : 400;
    return NextResponse.json({ ok: false, error: errorMessage }, { status });
  }

  return NextResponse.json(data, { headers: noStore });
}
