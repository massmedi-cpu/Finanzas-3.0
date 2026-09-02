export type ReceiptVisualLineInput = {
  text: string;
  score: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ReceiptVisualLayoutInput = {
  bounds: { width: number; height: number };
  lines: ReceiptVisualLineInput[];
};

type NativeToken = ReceiptVisualLineInput & {
  index: number;
  x: number;
  y: number;
  boxWidth: number;
  boxHeight: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

type Row = {
  tokens: NativeToken[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
};

type ColumnRole="quantity"|"description"|"price"|"amount";
type TableColumns={
  quantityRight:number|null;
  descriptionLeft:number|null;
  priceRight:number|null;
  amountRight:number|null;
  descriptionEnd:number;
};

type TableRow = {
  rowIndex: number;
  row: Row;
  quantity: NativeToken | null;
  description: NativeToken[];
  price: NativeToken | null;
  amount: NativeToken | null;
  quantityValue: number | null;
  priceValue: number | null;
  amountValue: number | null;
  continuation:boolean;
};

export type ReceiptVisualToken = NativeToken & {
  rowIndex: number;
  renderX: number;
  baselineY: number;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  textAnchor: "start" | "middle" | "end";
  letterSpacing: number;
  textLength?: number;
};

export type ReceiptVisualModel = {
  width: number;
  height: number;
  medianHeight: number;
  tokens: ReceiptVisualToken[];
  rules: number[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function normalizedKey(value: string) {
  return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function integerLike(text: string) {
  return /^\d{1,3}$/.test(text.trim());
}

function ruleLike(text: string) {
  const compact = text.replace(/\s/g, "");
  return compact.length >= 5 && /^[\-_.=·•—–]+$/.test(compact);
}

function parseMoneyCell(text: string) {
  const compact = text.trim().replace(/[€$£\s]/g, "").replace(/'/g, "");
  if (/^[+-]?\d+[.,]\d{2}$/.test(compact)) {
    const value = Number(compact.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d{3,5}$/.test(compact)) {
    const value = Number(compact) / 100;
    return Number.isFinite(value) ? value : null;
  }
  if (/^[+-]?\d{1,2}$/.test(compact)) {
    const value = Number(compact);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function formatMoneyCell(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function verticalOverlap(token: NativeToken, row: Row) {
  const overlap = Math.max(0, Math.min(token.bottom, row.bottom) - Math.max(token.y, row.top));
  return overlap / Math.max(1, Math.min(token.boxHeight, row.bottom - row.top));
}

function buildRows(tokens: NativeToken[], medianHeight: number) {
  const rows: Row[] = [];
  for (const token of [...tokens].sort((a, b) => a.centerY - b.centerY || a.x - b.x)) {
    let target: Row | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows.slice(-6)) {
      const distance = Math.abs(token.centerY - row.centerY);
      const rowHeight = Math.max(1, row.bottom - row.top);
      const tolerance = Math.max(medianHeight * 0.36, Math.min(token.boxHeight, rowHeight) * 0.52);
      if ((verticalOverlap(token, row) >= 0.5 || distance <= tolerance) && distance < bestDistance) {
        target = row;
        bestDistance = distance;
      }
    }
    if (!target) {
      rows.push({tokens:[token],top:token.y,bottom:token.bottom,left:token.x,right:token.right,centerY:token.centerY});
      continue;
    }
    target.tokens.push(token);
    target.tokens.sort((a, b) => a.x - b.x);
    target.top = Math.min(target.top, token.y);
    target.bottom = Math.max(target.bottom, token.bottom);
    target.left = Math.min(target.left, token.x);
    target.right = Math.max(target.right, token.right);
    target.centerY = median(target.tokens.map((item) => item.centerY));
  }
  return rows.sort((a, b) => a.top - b.top || a.left - b.left);
}

function nearestDistance(token: NativeToken, tokens: NativeToken[]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const candidate of tokens) {
    if (candidate.index === token.index) continue;
    nearest = Math.min(nearest, Math.hypot(candidate.centerX-token.centerX,candidate.centerY-token.centerY));
  }
  return nearest;
}

function removeGeometricNoise(tokens: NativeToken[], medianHeight: number) {
  if (tokens.length < 3) return tokens;
  return tokens.filter((token) => {
    const visible = token.text.replace(/\s/g, "");
    if (!visible || token.score < 15) return false;
    if (visible.length !== 1) return true;
    if (/^\p{L}$/u.test(visible) && token.score < 40) return false;
    const tiny = token.boxWidth <= medianHeight * 0.78 && token.boxHeight <= medianHeight * 0.94;
    if (!tiny || token.score >= 88) return true;
    return nearestDistance(token, tokens) <= medianHeight * 3.8;
  });
}

function mergeTokens(tokens: NativeToken[], text?: string): NativeToken {
  const ordered = [...tokens].sort((a, b) => a.x - b.x);
  const left = Math.min(...ordered.map((token) => token.x));
  const top = Math.min(...ordered.map((token) => token.y));
  const right = Math.max(...ordered.map((token) => token.right));
  const bottom = Math.max(...ordered.map((token) => token.bottom));
  const weight = ordered.reduce((sum, token) => sum + Math.max(1, token.text.length), 0);
  const score = ordered.reduce((sum, token) => sum + token.score * Math.max(1, token.text.length), 0) / Math.max(1, weight);
  return {
    text:text ?? ordered.map((token) => token.text.trim()).filter(Boolean).join(" "),
    score,left:0,top:0,width:0,height:0,index:ordered[0]?.index ?? 0,
    x:left,y:top,boxWidth:right-left,boxHeight:bottom-top,right,bottom,
    centerX:(left+right)/2,centerY:(top+bottom)/2,
  };
}

function rowChunks(row: Row, medianHeight: number) {
  const chunks: NativeToken[][] = [];
  const threshold = medianHeight * 1.55;
  for (const token of row.tokens) {
    const current = chunks.at(-1);
    if (!current) { chunks.push([token]); continue; }
    const previous = current.at(-1)!;
    if (token.x - previous.right > threshold) chunks.push([token]);
    else current.push(token);
  }
  return chunks;
}

function headerRole(text:string):ColumnRole|null{
  const key=normalizedKey(text).replace(/[^A-Z0-9]/g,"");
  if(/^(UND|UDS|UNID|CANT|CANTIDAD|QTY)/.test(key))return "quantity";
  if(key.includes("DESCRIP")||key.includes("ARTIC")||key.includes("CONCEP")||key.includes("DETALLE"))return "description";
  if(key.includes("PRECIO")||key==="PVP"||key.includes("UNITARIO"))return "price";
  if(key.includes("IMPORTE")||key.includes("SUBTOTAL")||key==="TOTAL")return "amount";
  return null;
}

function isTableHeader(row: Row) {
  const roles=new Set(row.tokens.map(token=>headerRole(token.text)).filter((role):role is ColumnRole=>Boolean(role)));
  const compact=normalizedKey(row.tokens.map(token=>token.text).join(" ")).replace(/[^A-Z0-9]/g,"");
  const conventional=roles.has("description")&&roles.has("price")&&roles.has("amount");
  const commercial=compact.includes("CANT")&&(compact.includes("ARTIC")||compact.includes("DESCRIP"))&&compact.includes("PRECI")&&(compact.includes("SUBTOTA")||compact.includes("IMPOR"));
  return conventional||commercial;
}

function summaryLike(row:Row){
  const key=normalizedKey(row.tokens.map(token=>token.text).join(" "));
  return /\b(BASE|IVA|TOTAL|SUBTOTAL|PAGO|EFECTIVO|TARJETA|CAMBIO|DESCUENTO|PENDIENTE|PAGADO)\b/.test(key);
}

function headerAnchors(row:Row|null){
  const roles=new Map<ColumnRole,NativeToken>();
  if(row)for(const token of row.tokens){const role=headerRole(token.text);if(role&&!roles.has(role))roles.set(role,token);}
  return roles;
}

function moneyTokens(row:Row){return row.tokens.filter(token=>parseMoneyCell(token.text)!=null);}
function textTokens(row:Row){return row.tokens.filter(token=>/\p{L}/u.test(token.text));}

function implicitTableBody(rows:Row[],width:number,medianHeight:number){
  const groups:number[][]=[];
  let current:number[]=[];
  let previous:Row|null=null;
  for(let index=0;index<rows.length;index++){
    const row=rows[index];
    const rightMoney=moneyTokens(row).some(token=>token.centerX>width*.62);
    const descriptive=textTokens(row).some(token=>token.centerX<width*.68);
    const candidate=rightMoney&&descriptive&&!summaryLike(row);
    const gap=previous?row.top-previous.bottom:0;
    if(candidate&&(current.length===0||gap<=medianHeight*2.2)){current.push(index);previous=row;continue;}
    if(current.length>=2)groups.push(current);
    current=candidate?[index]:[];
    previous=candidate?row:null;
  }
  if(current.length>=2)groups.push(current);
  return groups.sort((a,b)=>b.length-a.length)[0]||[];
}

function initialColumns(header:Row|null,bodyRows:Row[],width:number):TableColumns{
  const anchors=headerAnchors(header);
  const quantityCandidates:NativeToken[]=[];
  const descriptionCandidates:NativeToken[]=[];
  const rightMoneyCandidates:NativeToken[]=[];
  const secondMoneyCandidates:NativeToken[]=[];
  for(const row of bodyRows){
    const ordered=[...row.tokens].sort((a,b)=>a.x-b.x);
    const money=ordered.filter(token=>parseMoneyCell(token.text)!=null&&token.centerX>width*.42);
    if(money.length)rightMoneyCandidates.push(money.at(-1)!);
    if(money.length>=2)secondMoneyCandidates.push(money.at(-2)!);
    const q=ordered.find(token=>token.centerX<width*.28&&integerLike(token.text));
    if(q)quantityCandidates.push(q);
    const firstText=ordered.find(token=>/\p{L}/u.test(token.text)&&token.centerX<width*.72);
    if(firstText)descriptionCandidates.push(firstText);
  }
  const quantityRight=median(quantityCandidates.map(token=>token.right))||anchors.get("quantity")?.right||null;
  const descriptionLeft=median(descriptionCandidates.map(token=>token.x))||anchors.get("description")?.x||null;
  const amountRight=median(rightMoneyCandidates.map(token=>token.right))||anchors.get("amount")?.right||null;
  const priceRight=median(secondMoneyCandidates.map(token=>token.right))||anchors.get("price")?.right||null;
  const rightBoundary=priceRight??amountRight??width*.72;
  return {quantityRight,descriptionLeft,priceRight,amountRight,descriptionEnd:Math.max(width*.38,rightBoundary-width*.03)};
}

function distanceTo(value:number,target:number|null,fallback:number){return Math.abs(value-(target??fallback));}

function classifyTableRow(row: Row, rowIndex: number, width: number, columns:TableColumns): TableRow {
  const ordered=[...row.tokens].sort((a,b)=>a.x-b.x);
  const quantity=ordered.find(token=>integerLike(token.text)&&token.centerX<Math.max(width*.3,(columns.descriptionLeft??width*.2)))??null;
  const rightZone=ordered.filter(token=>token.index!==quantity?.index&&token.centerX>width*.38);
  const parseable=rightZone.filter(token=>parseMoneyCell(token.text)!=null);
  let amount:NativeToken|null=null;
  let price:NativeToken|null=null;

  if(parseable.length){
    amount=[...parseable].sort((a,b)=>distanceTo(a.right,columns.amountRight,width*.86)-distanceTo(b.right,columns.amountRight,width*.86))[0];
  }
  if(amount&&columns.priceRight){
    const candidates=rightZone.filter(token=>token.index!==amount?.index&&token.x<amount.x);
    const closest=[...candidates].sort((a,b)=>distanceTo(a.right,columns.priceRight,width*.68)-distanceTo(b.right,columns.priceRight,width*.68))[0];
    if(closest&&distanceTo(closest.right,columns.priceRight,width*.68)<=width*.14)price=closest;
  }
  if(!price){
    const remaining=parseable.filter(token=>token.index!==amount?.index&&token.x<(amount?.x??width));
    if(remaining.length)price=remaining.at(-1)!;
  }
  if(!amount&&price&&parseMoneyCell(price.text)!=null&&columns.amountRight){
    const candidates=rightZone.filter(token=>token.index!==price?.index&&token.x>price.x);
    const closest=[...candidates].sort((a,b)=>distanceTo(a.right,columns.amountRight,width*.86)-distanceTo(b.right,columns.amountRight,width*.86))[0];
    if(closest&&distanceTo(closest.right,columns.amountRight,width*.86)<=width*.14)amount=closest;
  }

  const excluded=new Set([quantity?.index,price?.index,amount?.index].filter((value):value is number=>typeof value==="number"));
  const description=ordered.filter(token=>!excluded.has(token.index)&&token.x<(price?.x??amount?.x??columns.descriptionEnd)&&token.centerX>Math.min(width*.18,(columns.quantityRight??width*.12)));
  const quantityValue=quantity?Number(quantity.text.trim()):null;
  let priceValue=price?parseMoneyCell(price.text):null;
  let amountValue=amount?parseMoneyCell(amount.text):null;
  if(amountValue!=null&&priceValue==null&&quantityValue&&quantityValue>0)priceValue=amountValue/quantityValue;
  if(priceValue!=null&&amountValue==null&&quantityValue&&quantityValue>0)amountValue=priceValue*quantityValue;
  const continuation=!quantity&&!parseable.length&&description.some(token=>/\p{L}/u.test(token.text));
  return {rowIndex,row,quantity,description,price,amount,quantityValue,priceValue,amountValue,continuation};
}

function tableBodyRange(rows:Row[],headerIndex:number,medianHeight:number,width:number){
  const indices:number[]=[];
  let previous=rows[headerIndex];
  let started=false;
  for(let index=headerIndex+1;index<rows.length;index++){
    const row=rows[index];
    const gap=row.top-previous.bottom;
    if(started&&gap>medianHeight*2.15)break;
    if(summaryLike(row)){if(started)break;continue;}
    const hasRightMoney=moneyTokens(row).some(token=>token.centerX>width*.42);
    const hasDescription=textTokens(row).some(token=>token.centerX>width*.16&&token.centerX<width*.76);
    const hasQuantity=row.tokens.some(token=>integerLike(token.text)&&token.centerX<width*.3);
    const item=hasDescription&&hasRightMoney&&(hasQuantity||moneyTokens(row).length>=1);
    const continuation=started&&hasDescription&&!hasRightMoney&&!hasQuantity&&gap<=medianHeight*1.35;
    if(!item&&!continuation){if(started)break;continue;}
    indices.push(index);started=true;previous=row;
  }
  return indices;
}

function rowFontSize(rowHeight: number, medianHeight: number, scale = 1) {
  return clamp(rowHeight * 1.02 * scale, medianHeight * 0.76, medianHeight * 1.58);
}

function rowFontWeight(rowHeight: number, medianHeight: number): 500 | 600 | 700 {
  return rowHeight/Math.max(1,medianHeight)>=1.16?700:600;
}

function visualToken(base: NativeToken, rowIndex: number, options: {
  text?: string;renderX?: number;baselineY: number;fontSize: number;fontWeight?:500|600|700;textAnchor?:"start"|"middle"|"end";
}): ReceiptVisualToken {
  return {...base,text:options.text??base.text,rowIndex,renderX:options.renderX??base.x,baselineY:options.baselineY,fontSize:options.fontSize,fontWeight:options.fontWeight??600,textAnchor:options.textAnchor??"start",letterSpacing:0};
}

export function buildReceiptVisualModel(layout: ReceiptVisualLayoutInput): ReceiptVisualModel {
  const width=Math.max(1,Number(layout.bounds.width)||1);
  const height=Math.max(1,Number(layout.bounds.height)||1);
  const rawTokens:NativeToken[]=layout.lines.map((line,index)=>{
    const x=line.left/100*width;const y=line.top/100*height;
    const boxWidth=Math.max(.5,line.width/100*width);const boxHeight=Math.max(.5,line.height/100*height);
    return {...line,index,x,y,boxWidth,boxHeight,right:x+boxWidth,bottom:y+boxHeight,centerX:x+boxWidth/2,centerY:y+boxHeight/2};
  }).filter(token=>token.text.trim()&&Number.isFinite(token.x)&&Number.isFinite(token.y));

  const initialMedianHeight=Math.max(1,median(rawTokens.map(token=>token.boxHeight))||1);
  const tokens=removeGeometricNoise(rawTokens,initialMedianHeight);
  const medianHeight=Math.max(1,median(tokens.map(token=>token.boxHeight))||initialMedianHeight);
  const rules=tokens.filter(token=>ruleLike(token.text)).map(token=>token.centerY).sort((a,b)=>a-b);
  const rows=buildRows(tokens.filter(token=>!ruleLike(token.text)),medianHeight);

  const tableHeaderIndex=rows.findIndex(isTableHeader);
  const tableBodyIndices=tableHeaderIndex>=0?tableBodyRange(rows,tableHeaderIndex,medianHeight,width):implicitTableBody(rows,width,medianHeight);
  const header=tableHeaderIndex>=0?rows[tableHeaderIndex]:null;
  let columns=initialColumns(header,tableBodyIndices.map(index=>rows[index]),width);
  let tableRows=tableBodyIndices.map(rowIndex=>classifyTableRow(rows[rowIndex],rowIndex,width,columns));
  columns=initialColumns(header,tableRows.map(item=>item.row),width);
  tableRows=tableBodyIndices.map(rowIndex=>classifyTableRow(rows[rowIndex],rowIndex,width,columns));

  const quantityRight=median(tableRows.map(item=>item.quantity?.right??0).filter(value=>value>0))||columns.quantityRight||0;
  const descriptionLeft=median(tableRows.map(item=>item.description[0]?.x??0).filter(value=>value>0))||columns.descriptionLeft||0;
  const priceRight=median(tableRows.map(item=>item.price?.right??0).filter(value=>value>0))||columns.priceRight||0;
  const amountRight=median(tableRows.map(item=>item.amount?.right??0).filter(value=>value>0))||columns.amountRight||0;
  const monetaryRows=tableRows.filter(item=>!item.continuation&&item.amountValue!=null&&Number.isFinite(item.amountValue));
  const tableTotal=monetaryRows.length>=2?Math.round(monetaryRows.reduce((sum,item)=>sum+Number(item.amountValue),0)*100)/100:null;
  const tableIndexSet=new Set<number>(tableBodyIndices);
  if(tableHeaderIndex>=0)tableIndexSet.add(tableHeaderIndex);

  let totalRowIndex=-1;
  if(tableTotal!=null&&tableBodyIndices.length){
    const afterTable=tableBodyIndices.at(-1)!+1;
    for(let index=afterTable;index<rows.length;index++){
      const row=rows[index];
      if(row.centerY>height*.93)break;
      const candidate=[...row.tokens].reverse().find(token=>token.centerX>width*.55&&parseMoneyCell(token.text)!=null);
      if(!candidate)continue;
      const parsed=parseMoneyCell(candidate.text);
      if(parsed!=null&&Math.abs(parsed-tableTotal)<=.011){totalRowIndex=index;break;}
    }
  }

  const result:ReceiptVisualToken[]=[];
  rows.forEach((row,rowIndex)=>{
    const rowHeight=Math.max(1,median(row.tokens.map(token=>token.boxHeight))||medianHeight);
    const fontSize=rowFontSize(rowHeight,medianHeight);
    const baselineY=median(row.tokens.map(token=>token.centerY))+fontSize*.36;

    if(rowIndex===tableHeaderIndex&&tableRows.length){
      for(const token of row.tokens){
        const role=headerRole(token.text);let renderX=token.x;let textAnchor:"start"|"middle"|"end"="start";
        if(role==="quantity"&&quantityRight){renderX=quantityRight;textAnchor="end";}
        else if(role==="description"&&descriptionLeft)renderX=descriptionLeft;
        else if(role==="price"&&priceRight){renderX=priceRight;textAnchor="end";}
        else if(role==="amount"&&amountRight){renderX=amountRight;textAnchor="end";}
        result.push(visualToken(token,rowIndex,{renderX,baselineY,fontSize:rowFontSize(rowHeight,medianHeight,1.04),fontWeight:700,textAnchor}));
      }
      return;
    }

    if(tableIndexSet.has(rowIndex)){
      const item=tableRows.find(candidate=>candidate.rowIndex===rowIndex);if(!item)return;
      const itemFont=rowFontSize(rowHeight,medianHeight,.98);
      if(item.quantity)result.push(visualToken(item.quantity,rowIndex,{renderX:quantityRight||item.quantity.right,baselineY,fontSize:itemFont,textAnchor:"end"}));
      if(item.description.length){const description=mergeTokens(item.description);result.push(visualToken(description,rowIndex,{renderX:descriptionLeft||description.x,baselineY,fontSize:itemFont}));}
      if(item.price)result.push(visualToken(item.price,rowIndex,{text:item.priceValue!=null?formatMoneyCell(item.priceValue):item.price.text,renderX:priceRight||item.price.right,baselineY,fontSize:itemFont,textAnchor:"end"}));
      if(item.amount)result.push(visualToken(item.amount,rowIndex,{text:item.amountValue!=null?formatMoneyCell(item.amountValue):item.amount.text,renderX:amountRight||item.amount.right,baselineY,fontSize:itemFont,textAnchor:"end"}));
      return;
    }

    if(rowIndex===totalRowIndex&&tableTotal!=null){
      const number=[...row.tokens].reverse().find(token=>parseMoneyCell(token.text)!=null)??row.tokens.at(-1)!;
      result.push(visualToken(number,rowIndex,{text:formatMoneyCell(tableTotal),renderX:amountRight||number.right,baselineY,fontSize:rowFontSize(rowHeight,medianHeight,1.14),fontWeight:700,textAnchor:"end"}));
      return;
    }

    const chunks=rowChunks(row,medianHeight);
    const rowSpan=Math.max(1,row.right-row.left);const rowCenter=(row.left+row.right)/2;
    const centerDistance=Math.abs(rowCenter-width/2);const leftMargin=row.left;const rightMargin=width-row.right;
    const rightAligned=chunks.length===1&&rowSpan<=width*.66&&rightMargin<=Math.max(width*.055,medianHeight*1.2)&&leftMargin>width*.28;
    const footerCentered=chunks.length===1&&row.centerY>=height*.84&&rowSpan<=width*.76&&centerDistance<=width*.14&&!rightAligned;
    const normallyCentered=chunks.length===1&&rowSpan<=width*.74&&centerDistance<=Math.max(width*.055,medianHeight*1.35);
    const centered=footerCentered||normallyCentered;const weight=rowFontWeight(rowHeight,medianHeight);
    for(const chunkTokens of chunks){
      const chunk=mergeTokens(chunkTokens);let renderX=chunk.x;let textAnchor:"start"|"middle"|"end"="start";
      if(centered){renderX=width/2;textAnchor="middle";}else if(rightAligned){renderX=row.right;textAnchor="end";}
      result.push(visualToken(chunk,rowIndex,{renderX,baselineY,fontSize,fontWeight:weight,textAnchor}));
    }
  });

  return {width,height,medianHeight,tokens:result.sort((a,b)=>a.rowIndex-b.rowIndex||a.x-b.x),rules};
}
