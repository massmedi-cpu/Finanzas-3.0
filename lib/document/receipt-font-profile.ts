import type { ReceiptVisualLayoutInput } from "./receipt-visual-model";

export type ReceiptFontProfile = {
  monospace: boolean;
  evidence: number;
  fontFamily: string;
  regularWeight: 500 | 600;
};

const SANS_FAMILY='"Roboto", "Arial Narrow", Arial, Helvetica, sans-serif';
const MONO_FAMILY='ui-monospace, "Roboto Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

function median(values:number[]){
  if(!values.length)return 0;
  const ordered=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(ordered.length/2);
  return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
}

function quantile(values:number[],ratio:number){
  if(!values.length)return 0;
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor((ordered.length-1)*Math.max(0,Math.min(1,ratio)))];
}

function glyphCount(text:string){
  return Array.from(text.replace(/\s/g,"")).length;
}

/**
 * Infers only whether the printed text behaves like a monospaced face.
 * No merchant names, receipt vocabulary or semantic categories are used.
 *
 * Tesseract gives us physical word boxes. In genuine monospaced printing the
 * box width per glyph, normalized by glyph height, stays unusually stable over
 * words of different lengths. Proportional invoices show materially more
 * dispersion. If evidence is weak, the existing sans-serif rendering wins.
 */
export function receiptFontProfile(layout:ReceiptVisualLayoutInput):ReceiptFontProfile{
  const width=Math.max(1,Number(layout.bounds.width)||1);
  const height=Math.max(1,Number(layout.bounds.height)||1);
  const samples:Array<{ratio:number;length:number}>=[];

  for(const line of layout.lines){
    const text=String(line.text||"").trim();
    const glyphs=glyphCount(text);
    if(glyphs<3||glyphs>24)continue;
    const letters=Array.from(text).filter(char=>/\p{L}/u.test(char)).length;
    if(letters/Math.max(1,glyphs)<.55)continue;
    const boxWidth=Number(line.width)/100*width;
    const boxHeight=Number(line.height)/100*height;
    if(!Number.isFinite(boxWidth)||!Number.isFinite(boxHeight)||boxWidth<=0||boxHeight<=0)continue;
    const ratio=(boxWidth/glyphs)/boxHeight;
    if(!Number.isFinite(ratio)||ratio<.12||ratio>1.4)continue;
    samples.push({ratio,length:glyphs});
  }

  const lengths=new Set(samples.map(sample=>sample.length));
  if(samples.length<8||lengths.size<4){
    return{monospace:false,evidence:samples.length,fontFamily:SANS_FAMILY,regularWeight:600};
  }

  const ratios=samples.map(sample=>sample.ratio);
  const center=median(ratios);
  if(center<=0)return{monospace:false,evidence:samples.length,fontFamily:SANS_FAMILY,regularWeight:600};
  const relativeMad=median(ratios.map(value=>Math.abs(value-center)))/center;
  const spread=quantile(ratios,.9)/Math.max(.0001,quantile(ratios,.1));
  const monospace=relativeMad<=.13&&spread<=1.34;

  return{
    monospace,
    evidence:samples.length,
    fontFamily:monospace?MONO_FAMILY:SANS_FAMILY,
    regularWeight:monospace?500:600,
  };
}
