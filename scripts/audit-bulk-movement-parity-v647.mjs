import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const editor=read("app/movimientos/bulk-movement-editor.tsx");
const client=read("app/movimientos/movements-client.tsx");
const detailDrawer=read("app/movimientos/movement-detail-drawer.tsx");
const documents=read("app/movimientos/movement-documents.tsx");
const route=read("app/api/movements/bulk/route.ts");
const selectionRoute=read("app/api/movements/selection/route.ts");
const batch=read("database/FINANCIAL_APP_3.8.0_BATCH_UNDO.sql");
const tagOps=read("database/FINANCIAL_APP_3.8.1_BULK_TAG_OPERATIONS.sql");
const layout=read("app/movimientos/layout.tsx");
const operationCss=read("app/movimientos/bulk-operations.css");

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
must(batch.includes("perform financial_app.update_transaction_rpc(v_id,p_patch)"),"El lote base debe delegar en el editor individual canónico");
must(batch.includes("perform financial_app.update_transaction_rpc(v_item.transaction_id,v_item.before_patch)"),"Deshacer debe restaurar mediante el editor individual canónico");

for(const token of [
  "bulkEditorOpen",
  'aria-controls="bulk-movement-editor"',
  "Marcar revisados",
  "Marcar conciliados",
  "const refreshed=await loadWith(appliedFilters,pageData.page)",
  "Los cambios se guardaron, pero no se pudo actualizar la lista",
  'status-badge info\">Nuevo'
])must(client.includes(token),`Flujo diario de Movimientos sin garantía en listado: ${token}`);
for(const token of [
  "El cambio se guardó, pero no se pudo actualizar la lista",
  'aria-busy={saving||undefined}',
  "Origen protegido",
  "Restaurar origen",
  "Historial de cambios"
])must(detailDrawer.includes(token),`Flujo diario de Movimientos sin garantía en detalle diferido: ${token}`);
must(!client.includes('status-badge new'),"Movimientos no puede usar el tono de estado local obsoleto 'new'");
must(client.includes("openRequestRef")&&client.includes("requestId!==openRequestRef.current"),"La apertura de detalle debe ignorar respuestas antiguas que lleguen fuera de orden");
must(client.includes("MovementDetailDrawer")&&!client.includes('className="movement-editor"'),"El editor individual debe permanecer fuera del bundle inicial de Movimientos");
must(documents.includes('includeArchived:"1"'),"El selector documental debe poder buscar explícitamente en Archivo histórico");
must(!documents.includes('archived:"1"'),"El selector documental no puede recuperar el parámetro legado archived=1");

for(const token of ["appliedFilters","selectFiltered","/api/movements/selection?","limit\",String(MAX_BULK_MOVEMENTS)","Seleccionar todos los filtrados","fuera de esta página","loadWith(appliedFilters,pageData.page-1)","loadWith(appliedFilters,pageData.page+1)"])
  must(client.includes(token),`Selección global filtrada incompleta: ${token}`);
must(selectionRoute.includes('financial_app_movements_selection')&&selectionRoute.includes("Math.min(200"),"La selección global filtrada debe conservar el límite 200 mediante el fast path IDs-only");
must(!selectionRoute.includes("financial_app_movements_advanced"),"El fast path no debe reconstruir movimientos completos solo para seleccionar IDs");
must(client.includes("setAppliedFilters({...next})"),"La vista debe distinguir filtros escritos de filtros realmente aplicados");

for(const token of ["TagMode","$tags","Añadir sin borrar las existentes","Quitar solo estas etiquetas","Sustituir todas las etiquetas","bulk-impact-preview","Revisar cambios","Confirmar y aplicar a ${selectedCount}"])
  must(editor.includes(token),`Editor masivo avanzado incompleto: ${token}`);
must(editor.includes('if(tagMode==="replace")next.tags=parsedTags'),"Sustituir etiquetas debe conservar la operación canónica tags");
must(editor.includes('next.$tags={mode:tagMode,values:parsedTags}'),"Añadir/quitar etiquetas debe usar el operador masivo explícito");

for(const token of ["MAX_BULK_TAGS = 20","MAX_TAG_LENGTH = 48","key!==\"$tags\"","conflicting_tag_operations","invalid_tag_operation"])
  must(route.includes(token),`Validación API de etiquetas masivas incompleta: ${token}`);
for(const token of ["p_patch-'$tags'","v_tag_mode not in ('add','remove')","cardinality(v_tag_values)>20","length(value)>48","v_item_patch:=jsonb_set","perform financial_app.update_transaction_rpc(v_id,v_item_patch)","transaction_bulk_batch_items"])
  must(tagOps.includes(token),`Migración 3.8.1 de etiquetas masivas incompleta: ${token}`);
must(tagOps.includes("v_before.tags")&&tagOps.includes("v_before_patch:=jsonb_build_object"),"Las etiquetas aditivas deben conservar snapshot reversible por movimiento");
must(tagOps.includes("unsupported_bulk_operation")&&tagOps.includes("conflicting_tag_operations"),"El RPC debe rechazar operadores especiales desconocidos o ambiguos");

must(layout.includes('import "./bulk-operations.css"'),"Movimientos debe cargar estilos dedicados de operaciones masivas");
for(const token of [".movement-selection-scope",".bulk-tags-field",".bulk-impact-preview","@media(max-width:760px)"])
  must(operationCss.includes(token),`Estilos de operaciones masivas incompletos: ${token}`);

if(failures.length){console.error("Financial App 6.4.7 bulk movement parity audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.7 bulk movement parity audit OK · selección global filtrada IDs-only, detalle diferido seguro, preview explícito, etiquetas aditivas, límite 200, refresco fiable y undo canónico protegidos");
