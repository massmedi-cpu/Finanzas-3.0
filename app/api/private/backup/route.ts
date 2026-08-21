import { NextRequest, NextResponse } from 'next/server';
import { capturePrivateBackup, getPrivateBackupHistory, getPrivateBackupSnapshot, getSavedPrivateBackup, previewPrivateBackup, restorePrivateBackup, type PrivateBackupPayload } from '../../../../src/private-data/backup';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  try{
    const mode=request.nextUrl.searchParams.get('mode')||'history';
    if(mode==='export'){
      const backup=await getPrivateBackupSnapshot();
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      return new NextResponse(JSON.stringify(backup,null,2),{status:200,headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="finanzas-private-backup-${stamp}.json"`,'cache-control':'private, no-store'}});
    }
    if(mode==='saved'){
      const id=request.nextUrl.searchParams.get('id')||''; if(!id) return NextResponse.json({ok:false,error:'backup_id_required'},{status:400});
      return NextResponse.json({ok:true,backup:await getSavedPrivateBackup(id)});
    }
    return NextResponse.json({ok:true,backups:await getPrivateBackupHistory()});
  }catch(error){ return NextResponse.json({ok:false,error:String((error as Error)?.message||error)},{status:500}); }
}
export async function POST(request:NextRequest){
  try{
    const body=await request.json().catch(()=>({}));
    const mode=String(body?.mode||'');
    if(mode==='preview') return NextResponse.json(await previewPrivateBackup(body.backup as PrivateBackupPayload));
    if(mode==='capture') return NextResponse.json(await capturePrivateBackup(String(body.note||'')));
    if(mode==='restore') return NextResponse.json(await restorePrivateBackup(body.backup as PrivateBackupPayload,String(body.expectedChecksum||''),String(body.confirmation||'')));
    return NextResponse.json({ok:false,error:'invalid_backup_action'},{status:400});
  }catch(error){ const message=String((error as Error)?.message||error); const status=/confirmation|not_safe|checksum/.test(message)?409:500; return NextResponse.json({ok:false,error:message},{status}); }
}
