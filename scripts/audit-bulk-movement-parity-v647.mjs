import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const editor=read("app/movimientos/bulk-movement-editor.tsx");
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
must(route.includes("MAX_BULK_MOVEMENTS = 200"),"La API perdió el límite server-side de 200 movimientos");
must(route.includes('supabase.rpc("financial_app_bulk_update_transactions"'),"La API debe reutilizar el RPC masivo canónico");
must(batch.includes("perform financial_app.update_transaction_rpc(v_id,p_patch)"),"El lote debe delegar en el editor individual canónico");
must(batch.includes("perform financial_app.update_transaction_rpc(v_item.transaction_id,v_item.before_patch)"),"Deshacer debe restaurar mediante el editor individual canónico");

if(failures.length){console.error("Financial App 6.4.7 bulk movement parity audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.7 bulk movement parity audit OK · texto reversible, límite 200 y motor único protegidos");
