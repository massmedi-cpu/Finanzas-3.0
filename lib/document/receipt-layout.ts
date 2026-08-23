export type ReceiptLineItem={description:string;quantity:string;unitPrice:string;total:string};
export type ReceiptSummaryLine={label:string;value:string};
export type ReceiptLayout={header:string[];items:ReceiptLineItem[];summary:ReceiptSummaryLine[];footer:string[]};

const moneyPattern="[+-]?\\d{1,7}(?:[.,]\\d{2})";
const qtyPattern="\\d+(?:[.,]\\d+)?";
const itemRegex=new RegExp(`^(.+?)\\s+(${qtyPattern})\\s+(${moneyPattern})\\s+(${moneyPattern})(?:\\s*(?:EUR|€))?$`,`i`);
const summaryRegex=/^(base\s+imponible|subtotal|iva(?:\s*\([^)]*\)|\s+\d+(?:[.,]\d+)?%?)?|total(?:\s+a\s+pagar)?|efectivo|tarjeta)\s*:?[\s-]*(.+)$/i;
const columnHeader=/^(descripci[oó]n\s+)?u(?:d|ds|ds\.)\s+precio\s+total$/i;

function cleanLine(value:string){return value.replace(/[|]+/g," ").replace(/\s+/g," ").trim();}
function normalizeNumeric(value:string){return value.replace(/,(?=\d{2}$)/,".");}
function plausibleItem(quantity:string,unitPrice:string,total:string){
  const q=Number(normalizeNumeric(quantity));const unit=Number(normalizeNumeric(unitPrice));const sum=Number(normalizeNumeric(total));
  if(!Number.isFinite(q)||!Number.isFinite(unit)||!Number.isFinite(sum)||q<=0||unit<0||sum<0)return false;
  if(q>9999||unit>1_000_000||sum>1_000_000)return false;
  const expected=q*unit;return Math.abs(expected-sum)<=Math.max(.08,Math.abs(sum)*.08)||q===1;
}

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
  return{header,items,summary,footer};
}
