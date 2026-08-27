export type ReceiptLineItem={description:string;quantity:string;unitPrice:string;total:string;confidence?:number};
export type ReceiptSummaryLine={label:string;value:string};
export type ReceiptLayout={header:string[];items:ReceiptLineItem[];summary:ReceiptSummaryLine[];footer:string[];source?:"text"|"geometry_tsv"};

type TsvWord={text:string;conf:number;left:number;top:number;width:number;height:number;key:string};
type TsvLine={top:number;bottom:number;words:TsvWord[];plain:string};

const moneyPattern="[+-]?\\d{1,7}(?:[.,]\\d{2})";
const qtyPattern="\\d+(?:[.,]\\d+)?";
const itemRegex=new RegExp(`^(.+?)\\s+(${qtyPattern})\\s+(${moneyPattern})\\s+(${moneyPattern})(?:\\s*(?:EUR|€))?$`,`i`);
const summaryRegex=/^(base(?:\s+imponible)?|subtotal|total\s+iva|iva(?:\s*\([^)]*\)|\s+\d+(?:[.,]\d+)?%?)?|total(?:\s+a\s+pagar)?|efectivo|tarjeta)\s*:?[\s-]*(.+)$/i;
const columnHeader=/^(descripci[oó]n\s+)?u(?:d|ds|ds\.)\s+precio\s+(?:total|importe)$/i;

function cleanLine(value:string){return value.replace(/[|]+/g," ").replace(/\s+/g," ").trim();}
function normalizeNumeric(value:string){return value.replace(/O/gi,"0").replace(/,(?=\d{2}$)/,".");}
function plausibleItem(quantity:string,unitPrice:string,total:string){
  const q=Number(normalizeNumeric(quantity));const unit=Number(normalizeNumeric(unitPrice));const sum=Number(normalizeNumeric(total));
  if(!Number.isFinite(q)||!Number.isFinite(unit)||!Number.isFinite(sum)||q<=0||unit<0||sum<0)return false;
  if(q>9999||unit>1_000_000||sum>1_000_000)return false;
  const expected=q*unit;return Math.abs(expected-sum)<=Math.max(.08,Math.abs(sum)*.08)||q===1;
}
function parseDecimal(value:string){const normalized=cleanLine(value).replace(/\s+/g,"").replace(/O/gi,"0").replace(/,/g,".");const match=normalized.match(/\d{1,7}\.\d{2}/);return match?.[0]||null;}
function parseQuantity(value:string){const normalized=cleanLine(value).replace(/O/gi,"0");const match=normalized.match(/\b\d{1,3}(?:[.,]\d+)?\b/);return match?.[0]||null;}
function lineText(words:TsvWord[]){return cleanLine([...words].sort((a,b)=>a.left-b.left).map(word=>word.text).join(" "));}
function center(word:TsvWord){return word.left+word.width/2;}
function normalizeKey(value:string){return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"");}

export function receiptDisplayNumber(value:string){return value.replace(".",",");}

export function parseReceiptLayout(text:string):ReceiptLayout{
  const header:string[]=[];const items:ReceiptLineItem[]=[];const summary:ReceiptSummaryLine[]=[];const footer:string[]=[];
  let seenItem=false;
  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanLine(raw);if(!line)continue;if(columnHeader.test(line))continue;
    const item=line.match(itemRegex);
    if(item&&plausibleItem(item[2],item[3],item[4])){
      seenItem=true;items.push({description:item[1].trim(),quantity:receiptDisplayNumber(item[2]),unitPrice:receiptDisplayNumber(item[3]),total:receiptDisplayNumber(item[4])});continue;
    }
    const totalLine=line.match(summaryRegex);
    if(totalLine&&/\d/.test(totalLine[2])){summary.push({label:totalLine[1].replace(/\s+/g," ").trim(),value:totalLine[2].trim()});continue;}
    if(seenItem)footer.push(line);else header.push(line);
  }
  return{header,items,summary,footer,source:"text"};
}

export function parseTsvWords(tsv:string){
  const words:TsvWord[]=[];
  for(const row of String(tsv||"").replace(/\r/g,"").split("\n").slice(1)){
    const columns=row.split("\t");if(columns.length<12||Number(columns[0])!==5)continue;
    const text=columns.slice(11).join("\t").trim();const conf=Number(columns[10]);const left=Number(columns[6]);const top=Number(columns[7]);const width=Number(columns[8]);const height=Number(columns[9]);
    if(!text||!Number.isFinite(conf)||conf<0||![left,top,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
    const useful=(text.match(/[\p{L}\d€%.,:()/-]/gu)||[]).length;if(useful/Math.max(1,text.length)<.45)continue;
    if(conf<12&&!/[\p{L}]{3,}|\d+[.,]\d{2}/u.test(text))continue;
    words.push({text,conf,left,top,width,height,key:`${columns[2]}:${columns[3]}:${columns[4]}`});
  }
  return words;
}

export function tsvLines(tsv:string){
  const groups=new Map<string,TsvWord[]>();
  for(const word of parseTsvWords(tsv)){const group=groups.get(word.key)||[];group.push(word);groups.set(word.key,group);}
  return [...groups.values()].map(words=>{words.sort((a,b)=>a.left-b.left);return{top:Math.min(...words.map(w=>w.top)),bottom:Math.max(...words.map(w=>w.top+w.height)),words,plain:lineText(words)} as TsvLine;}).sort((a,b)=>a.top-b.top);
}

function headerAnchors(line:TsvLine){
  const words=line.words;let qty:TsvWord|undefined;let price:TsvWord|undefined;let total:TsvWord|undefined;
  for(const word of words){
    const key=normalizeKey(word.text);
    if(!qty&&/^(?:U[DO0]S?|UND|UNDS|CANT|CANTIDAD)$/.test(key))qty=word;
    if(!price&&/^PRECI/.test(key))price=word;
    if(!total&&/^(?:IMPORTE|TOTAL)$/.test(key))total=word;
  }
  if(!price)return null;
  const priceX=center(price);let qtyX=qty?center(qty):Number.NaN;let totalX=total?center(total):Number.NaN;
  if(!Number.isFinite(qtyX)&&Number.isFinite(totalX))qtyX=priceX-Math.max(70,(totalX-priceX)*1.05);
  if(!Number.isFinite(totalX)&&Number.isFinite(qtyX))totalX=priceX+Math.max(70,(priceX-qtyX)*1.05);
  if(!(Number.isFinite(qtyX)&&Number.isFinite(totalX)&&qtyX<priceX&&priceX<totalX))return null;
  return{qtyX,priceX,totalX};
}

function numericFromWords(words:TsvWord[],kind:"qty"|"money"){
  if(!words.length)return null;const ordered=[...words].sort((a,b)=>a.left-b.left);const spaced=ordered.map(word=>word.text).join(" ");const compact=ordered.map(word=>word.text).join("");
  return kind==="qty"?parseQuantity(spaced)||parseQuantity(compact):parseDecimal(spaced)||parseDecimal(compact);
}

function inferredQuantity(unitPrice:string|null,total:string|null){
  if(!unitPrice||!total)return null;const unit=Number(normalizeNumeric(unitPrice));const sum=Number(normalizeNumeric(total));
  if(!Number.isFinite(unit)||!Number.isFinite(sum)||unit<=0||sum<0)return null;const candidate=Math.round(sum/unit);
  if(candidate<1||candidate>999)return null;return Math.abs(candidate*unit-sum)<=Math.max(.08,Math.abs(sum)*.035)?String(candidate):null;
}

function meanConfidence(words:TsvWord[]){
  if(!words.length)return undefined;const weighted=words.reduce((state,word)=>({sum:state.sum+word.conf*Math.max(1,word.text.length),weight:state.weight+Math.max(1,word.text.length)}),{sum:0,weight:0});
  return Math.round((weighted.sum/Math.max(1,weighted.weight))*10)/10;
}

function descriptionText(words:TsvWord[]){
  const keepShort=/^(?:DE|DEL|LA|EL|AL|Y|CON|SIN|XL|XXL|ML|CL|KG)$/;const filtered=words.filter(word=>{const key=normalizeKey(word.text);if(key.length>3||word.conf>=60||keepShort.test(key))return true;return false;});
  return lineText(filtered.length?filtered:words);
}

export function parseReceiptTsvLayout(tsv:string):ReceiptLayout|null{
  const lines=tsvLines(tsv);if(!lines.length)return null;
  const headerIndex=lines.findIndex(line=>{const key=normalizeKey(line.plain);return key.includes("DESCRIP")&&key.includes("PRECI");});
  if(headerIndex<0)return null;const anchors=headerAnchors(lines[headerIndex]);if(!anchors)return null;
  const qtyBoundary=(anchors.qtyX+anchors.priceX)/2;const descriptionBoundary=anchors.qtyX-Math.max(30,(anchors.priceX-anchors.qtyX)*.48);const totalBoundary=(anchors.priceX+anchors.totalX)/2;
  const header=lines.slice(0,headerIndex).map(line=>line.plain).filter(Boolean);const items:ReceiptLineItem[]=[];const summary:ReceiptSummaryLine[]=[];const footer:string[]=[];let tableEnded=false;
  for(const line of lines.slice(headerIndex+1)){
    const plain=cleanLine(line.plain);if(!plain)continue;
    const summaryStart=plain.search(/\b(?:base|subtotal|total|iva|efectivo|tarjeta)\b/i);const summaryText=summaryStart>=0?plain.slice(summaryStart):plain.replace(/^[^\p{L}]+/u,"");const summaryMatch=summaryText.match(summaryRegex);
    if(summaryMatch){const value=parseDecimal(summaryMatch[2])||parseDecimal(plain);if(value)summary.push({label:summaryMatch[1].trim(),value});tableEnded=true;continue;}
    if(/\b(PENDIENTE|PAGADO|GRACIAS|MESA|TERRAZA|POWERED)\b/i.test(plain)){tableEnded=true;footer.push(plain);continue;}
    if(tableEnded){footer.push(plain);continue;}
    const descriptionWords=line.words.filter(word=>center(word)<descriptionBoundary);
    const qtyWords=line.words.filter(word=>center(word)>=descriptionBoundary&&center(word)<qtyBoundary);
    const priceWords=line.words.filter(word=>center(word)>=qtyBoundary&&center(word)<totalBoundary);
    const totalWords=line.words.filter(word=>center(word)>=totalBoundary);
    let description=descriptionText(descriptionWords);let quantity=numericFromWords(qtyWords,"qty");let unitPrice=numericFromWords(priceWords,"money");let total=numericFromWords(totalWords,"money");
    if(!description||!quantity||!unitPrice||!total){
      const decimals=(plain.match(/\d{1,7}[.,]\d{2}\b/g)||[]);const tokens=plain.split(/\s+/);const qtyCandidate=tokens.findLast(token=>/^\d{1,3}$/.test(token));
      if(decimals.length>=2){unitPrice=unitPrice||decimals.at(-2)!;total=total||decimals.at(-1)!;quantity=quantity||qtyCandidate||inferredQuantity(unitPrice,total);const numericStart=qtyCandidate?plain.lastIndexOf(qtyCandidate):plain.indexOf(decimals.at(-2)!);if(!description&&numericStart>0)description=cleanLine(plain.slice(0,numericStart));}
    }
    quantity=quantity||inferredQuantity(unitPrice,total);
    if(description&&quantity&&unitPrice&&total&&plausibleItem(quantity,unitPrice,total))items.push({description,quantity:receiptDisplayNumber(quantity),unitPrice:receiptDisplayNumber(unitPrice),total:receiptDisplayNumber(total),confidence:meanConfidence(descriptionWords)});
  }
  if(!items.length)return null;
  return{header,items,summary,footer,source:"geometry_tsv"};
}

export function receiptLayoutToText(layout:ReceiptLayout){
  const lines=[...layout.header,"DESCRIPCION UDS PRECIO IMPORTE",...layout.items.map(item=>`${item.description} ${item.quantity} ${item.unitPrice} ${item.total}`),...layout.summary.map(line=>`${line.label}: ${line.value}`),...layout.footer];
  return lines.filter(Boolean).join("\n");
}

export function receiptLayoutTotal(layout:ReceiptLayout|null|undefined){
  if(!layout)return null;const total=[...layout.summary].reverse().find(line=>/^total(?:\s+a\s+pagar)?$/i.test(line.label.trim()));if(!total)return null;const value=parseDecimal(total.value);if(!value)return null;const number=Number(value.replace(",","."));return Number.isFinite(number)?number:null;
}
