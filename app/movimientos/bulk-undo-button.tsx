"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BulkUndoButton(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<string|null>(null);

  async function undo(){
    if(!window.confirm("¿Deshacer la última edición masiva? Solo se hará si ninguno de esos movimientos ha cambiado después."))return;
    setBusy(true);setStatus(null);
    try{
      const response=await fetch("/api/movements/bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"undo"})});
      const body=await response.json() as {ok?:boolean;undone?:number;error?:string};
      if(!response.ok||!body.ok){
        if(body.error?.includes("bulk_batch_not_found"))throw new Error("No hay una edición masiva pendiente de deshacer.");
        if(body.error?.includes("changed_since_apply"))throw new Error("No se puede deshacer: algún movimiento fue modificado después del lote.");
        throw new Error(body.error||"No se pudo deshacer la edición masiva.");
      }
      setStatus(`${Number(body.undone||0)} movimiento${Number(body.undone||0)===1?"":"s"} restaurado${Number(body.undone||0)===1?"":"s"}.`);
      router.refresh();
    }catch(cause){setStatus(cause instanceof Error?cause.message:"No se pudo deshacer la edición masiva.");}
    finally{setBusy(false);}
  }

  return <div className="bulk-undo-control"><button className="ghost" type="button" onClick={undo} disabled={busy}>{busy?"Deshaciendo…":"Deshacer última edición masiva"}</button>{status&&<small role="status">{status}</small>}</div>;
}
