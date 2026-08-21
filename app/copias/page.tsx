import { getPrivateBackupHistory, getPrivateBackupSnapshot } from '../../src/private-data/backup';
import BackupManager from './BackupManager';

export const dynamic='force-dynamic';

export default async function CopiasPage(){
  let dataError=false; let history:Awaited<ReturnType<typeof getPrivateBackupHistory>>=[]; let snapshot:Awaited<ReturnType<typeof getPrivateBackupSnapshot>>|null=null;
  try{ [history,snapshot]=await Promise.all([getPrivateBackupHistory(),getPrivateBackupSnapshot()]); }catch{ dataError=true; }
  return <main className="page"><section className="page-header"><div><div className="eyebrow">Portabilidad y recuperación</div><h1>Copias privadas seguras</h1><p className="subtitle">Protege todo lo que has añadido o corregido dentro de Finanzas sin duplicar ni modificar la fuente bancaria original.</p></div>{snapshot&&<span className="badge">Esquema V{snapshot.schemaVersion}</span>}</section>
    {dataError||!snapshot?<div className="status-panel status-danger"><div><div className="status-title">No se puede crear una copia fiable</div><div className="status-copy">La sección se detiene si no puede leer simultáneamente el estado privado y la huella de la fuente.</div></div></div>:<BackupManager initialHistory={history} currentChecksum={snapshot.sourceChecksum} currentRows={snapshot.sourceRows}/>}</main>;
}
