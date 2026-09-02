export function movementNumberParam(value:string|null){
  if(!value)return null;
  const number=Number(value.replace(",","."));
  return Number.isFinite(number)?number:null;
}

export function movementBooleanParam(value:string|null):boolean|null{
  if(value==null||value==="")return null;
  const normalized=value.toLowerCase();
  if(["1","true","yes","si","sí"].includes(normalized))return true;
  if(["0","false","no"].includes(normalized))return false;
  return null;
}

export function movementRpcFilterParams(q:URLSearchParams){
  return {
    p_search:q.get("search")||null,
    p_account_id:q.get("account")||null,
    p_type:q.get("type")||null,
    p_category:q.get("category")||null,
    p_subcategory:q.get("subcategory")||null,
    p_channel:q.get("channel")||null,
    p_tag:q.get("tag")||null,
    p_review_only:q.get("review")==="1",
    p_recurring:movementBooleanParam(q.get("recurring")),
    p_internal_transfer:movementBooleanParam(q.get("internalTransfer")),
    p_reconciled:movementBooleanParam(q.get("reconciled")),
    p_has_documents:movementBooleanParam(q.get("documents")),
    p_has_splits:movementBooleanParam(q.get("splits")),
    p_date_from:q.get("from")||null,
    p_date_to:q.get("to")||null,
    p_min_amount:movementNumberParam(q.get("min")),
    p_max_amount:movementNumberParam(q.get("max")),
    p_sort:q.get("sort")||"date_desc",
    p_merchant:q.get("merchant")||null,
    p_cash_flow_only:movementBooleanParam(q.get("cashFlow"))===true,
    p_duplicate:movementBooleanParam(q.get("duplicate")),
  };
}
