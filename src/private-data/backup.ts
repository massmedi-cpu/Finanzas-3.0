import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const BACKUP_URL='https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-backup';

export interface PrivateBackupPayload {
  format: 'finanzas-private-backup';
  schemaVersion: 1;
  capturedAt: string;
  sourceChecksum: string;
  sourceRows: number;
  tables: Record<string, unknown[]>;
}
export interface BackupPreview {
  ok: boolean; safe: boolean; schemaCompatible: boolean; checksumCompatible: boolean; invalidMovementRefs: number;
  currentChecksum: string; backupChecksum: string; currentRows: number; backupRows: number;
  counts: Record<string, number>; error?: string;
}
export interface BackupHistoryItem { id:string; captured_at:string; source_checksum:string|null; source_rows:number; schema_version:number; note:string|null; }

async function request<T>(path:string,init:RequestInit={}):Promise<T>{
  const store=await cookies(); const token=store.get(SESSION_COOKIE)?.value; if(!token) throw new Error('private-session-required');
  const headers=new Headers(init.headers||{}); headers.set('authorization',`Bearer ${token}`); headers.set('accept','application/json'); if(init.body) headers.set('content-type','application/json');
  const response=await fetch(`${BACKUP_URL}${path}`,{...init,headers,cache:'no-store'});
  const data=(await response.json().catch(()=>({ok:false,error:'invalid-backup-response'}))) as T & {ok?:boolean;error?:string};
  if(!response.ok || data.ok===false) throw new Error(data.error||`backup-${response.status}`); return data;
}
export function getPrivateBackupSnapshot(){ return request<PrivateBackupPayload>('/snapshot'); }
export async function getPrivateBackupHistory(){ const data=await request<{ok:boolean;backups:BackupHistoryItem[]}>('/history'); return Array.isArray(data.backups)?data.backups:[]; }
export async function getSavedPrivateBackup(id:string){ const data=await request<{ok:boolean;backup:{payload:PrivateBackupPayload}&BackupHistoryItem}>(`/saved?id=${encodeURIComponent(id)}`); return data.backup; }
export function previewPrivateBackup(backup:PrivateBackupPayload){ return request<BackupPreview>('/preview',{method:'POST',body:JSON.stringify({backup})}); }
export function capturePrivateBackup(note?:string){ return request<{ok:boolean;id:string;capturedAt:string;sourceChecksum:string;sourceRows:number;preview:BackupPreview}>('/capture',{method:'POST',body:JSON.stringify({note:note||null})}); }
export function restorePrivateBackup(backup:PrivateBackupPayload,expectedChecksum:string,confirmation:string){ return request<{ok:boolean;preview:BackupPreview;restore:unknown}>('/restore',{method:'POST',body:JSON.stringify({backup,expectedChecksum,confirmation})}); }
