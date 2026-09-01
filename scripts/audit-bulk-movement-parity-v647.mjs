import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const editor=read("app/movimientos/bulk-movement-editor.tsx");
const client=read("app/movimientos/movements-client.tsx");
const documents=read("app/movimientos/movement-documents.tsx");
const route=read("app/api/movements/bulk/route.ts");
const batch=read("database/FINANCIAL_APP_3.8.0_BATCH_UNDO.sql");

for(const [field,state,label] of [
  ["normalizedConcept","normalizedConceptEnabled","Cambiar concepto normalizado"],
  ["counterparty","counterpartyEnabled","Cambiar comercio o contraparte"],
  ["description","descriptionEnabled","Cambiar descripción"],
  ["notes","notesEnabled","Cambiar notas"]
]){
  must(editor.includes(`next.${field}=`),`Edición masiva 6.4.7 no envía ${field}`);
  must(editor.includes(state),`Edición masiva 6.4.7 no protege ${field} con opt-in explícito`);
  must(editor.includes(label),`Edición masiva 6.4.7 no identifica ${field} en UI`);
  must(batch.includes(`'${field}'`),`Snapshot reversible del lote no conserva ${field}`);
}

must(!editor.includes("next.effectiveDate="),"6.4.7 no debe aplicar una fecha única a un lote de movimientos");
must(editor.includes("La fecha se mantiene como edición individual"),"La UI debe explicar por qué la fecha no se ofrece en lote");
must(editor.includes("Máximo 200 movimientos por operación"),"Se perdió el límite visible de seguridad del lote");
must(editor.includes('id="bulk-movement-editor"')&&editor.includes("onClose"),"El editor masivo debe poder abrirse y cerrarse sin perder la selección");
must(route.includes("MAX_BULK_MOVEMENTS = 200"),"La API perdió el límite server-side de 200 movimientos");
must(route.includes('supabase.rpc("financial_app_bulk_update_transactions"'),"La API debe reutilizar el RPC masivo canónico");
must(batch.includes("perform financial_app.update_transaction_rpc(v_id,p_patch)"),"El lote debe delegar en el editor individual canónico");
must(batch.includes("perform financial_app.update_transaction_rpc(v_item.transaction_id,v_item.before_patch)"),"Deshacer debe restaurar mediante el editor individual canónico");

for(const token of [
  "bulkEditorOpen",
  'aria-controls="bulk-movement-editor"',
  "Marcar revisados",
  "Marcar conciliados",
  "const refreshed=await loadWith(filters,pageData.page)",
  "Los cambios se guardaron, pero no se pudo actualizar la lista",
  "El cambio se guardó, pero no se pudo actualizar la lista",
  'aria-busy={saving||undefined}',
  'status-badge info\">Nuevo'
])must(client.includes(token),`Flujo diario de Movimientos sin garantía: ${token}`);
must(!client.includes('status-badge new'),"Movimientos no puede usar el tono de estado local obsoleto 'new'");
must(client.includes("openRequestRef")&&client.includes("requestId!==openRequestRef.current"),"La apertura de detalle debe ignorar respuestas antiguas que lleguen fuera de orden");
must(documents.includes('includeArchived:"1"'),"El selector documental debe poder buscar explícitamente en Archivo histórico");
must(!documents.includes('archived:"1"'),"El selector documental no puede recuperar el parámetro legado archived=1");

if(failures.length){console.error("Financial App 6.4.7 bulk movement parity audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.7 bulk movement parity audit OK · texto reversible, límite 200, refresco fiable, detalle race-safe y Archivo completo protegidos");