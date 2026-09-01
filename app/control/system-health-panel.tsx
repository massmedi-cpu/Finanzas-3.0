import type { SystemHealthSnapshot } from "@/lib/financial/system-health";

const dateTime=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Madrid"});
function fmt(value:string|null){if(!value)return "Sin registro";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"Sin registro":dateTime.format(parsed);}

export function SystemHealthPanel({data}:{data:SystemHealthSnapshot}){
  const issues=data.documents.cleanupPending+data.documents.missingOriginals+data.documents.orphanStorageObjects+data.documents.duplicateLinks;
  return <section className="control-panel" aria-label="Estado operativo del sistema">
    <div className="control-panel-head"><div><p className="eyebrow">ESTADO OPERATIVO</p><h2>{data.ok?"Sistema al día":"Atención operativa"}</h2></div><strong className={data.ok?"positive":"negative"}>{data.ok?"OK":"REVISAR"}</strong></div>
    <div className="control-grid compact-grid">
      <article><span>Datos de Drive</span><strong>{data.sync.status}</strong><small>Fuente: {fmt(data.sync.sourceModifiedAt)}</small></article>
      <article><span>Última sincronización</span><strong>{fmt(data.sync.lastSyncAt)}</strong><small>{data.sync.reconciliationPending?"Reconciliación pendiente":"Incremental operativa"}</small></article>
      <article><span>Documentos pendientes</span><strong>{data.documents.pending}</strong><small>{data.documents.active} activos · {data.documents.archived} archivados</small></article>
      <article><span>Integridad Storage</span><strong>{issues}</strong><small>{data.documents.cleanupPending} limpieza · {data.documents.missingOriginals} sin original · {data.documents.orphanStorageObjects} huérfanos · {data.documents.duplicateLinks} enlaces duplicados</small></article>
    </div>
    <p className="muted-copy">Este panel combina frescura de Drive y ciclo documental para distinguir un dato realmente actualizado de una pantalla simplemente cargada.</p>
  </section>;
}
