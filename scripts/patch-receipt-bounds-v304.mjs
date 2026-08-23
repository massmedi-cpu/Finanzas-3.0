import fs from "node:fs";
const path="lib/document/ticket-ocr.ts";
let s=fs.readFileSync(path,"utf8");
const old=`function detectReceiptBounds(data: ImageData, width: number, height: number) {
  const step=Math.max(4,Math.floor(Math.max(width,height)/650));
  const rows=Math.ceil(height/step);const cols=Math.ceil(width/step);
  const rowHits=new Uint32Array(rows);const colHits=new Uint32Array(cols);
  for(let gy=0;gy<rows;gy+=1){
    const y=Math.min(height-1,gy*step);
    for(let gx=0;gx<cols;gx+=1){
      const x=Math.min(width-1,gx*step);const offset=(y*width+x)*4;
      const r=data.data[offset],g=data.data[offset+1],b=data.data[offset+2];
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b);const luma=r*.2126+g*.7152+b*.0722;
      const paper=luma>=142&&(hi-lo)<=72&&g>=r-38&&b>=r-38;
      if(paper){rowHits[gy]+=1;colHits[gx]+=1;}
    }
  }
  const rowMin=Math.max(4,Math.round(cols*.16));const colMin=Math.max(4,Math.round(rows*.22));
  let top=0,bottom=rows-1,left=0,right=cols-1;
  while(top<rows&&rowHits[top]<rowMin)top+=1;while(bottom>=0&&rowHits[bottom]<rowMin)bottom-=1;
  while(left<cols&&colHits[left]<colMin)left+=1;while(right>=0&&colHits[right]<colMin)right-=1;
  if(top>=bottom||left>=right)return null;
  let x=left*step,y=top*step,w=(right-left+1)*step,h=(bottom-top+1)*step;
  if(w<width*.38||h<height*.42)return null;
  const mx=Math.round(w*.045),my=Math.round(h*.035);
  x=Math.max(0,x-mx);y=Math.max(0,y-my);w=Math.min(width-x,w+mx*2);h=Math.min(height-y,h+my*2);
  return {x,y,w,h};
}`;
const next=`function detectReceiptBounds(data: ImageData, width: number, height: number) {
  const step=Math.max(4,Math.floor(Math.max(width,height)/650));
  const rows=Math.ceil(height/step);const cols=Math.ceil(width/step);const rowMin=Math.max(4,Math.round(cols*.16));
  const rowSpans:Array<{y:number;minX:number;maxX:number}>=[];
  for(let gy=0;gy<rows;gy+=1){
    const y=Math.min(height-1,gy*step);let hits=0,minX=width,maxX=0;
    for(let gx=0;gx<cols;gx+=1){
      const x=Math.min(width-1,gx*step);const offset=(y*width+x)*4;
      const r=data.data[offset],g=data.data[offset+1],b=data.data[offset+2];
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b);const luma=r*.2126+g*.7152+b*.0722;
      const paper=luma>=142&&(hi-lo)<=72&&g>=r-38&&b>=r-38;
      if(paper){hits+=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
    }
    if(hits>=rowMin)rowSpans.push({y,minX,maxX});
  }
  if(rowSpans.length<Math.max(8,rows*.22))return null;
  const sortedLeft=rowSpans.map(row=>row.minX).sort((a,b)=>a-b);const sortedRight=rowSpans.map(row=>row.maxX).sort((a,b)=>a-b);
  const median=(values:number[])=>values[Math.floor(values.length/2)];
  let left=median(sortedLeft),right=median(sortedRight),top=rowSpans[0].y,bottom=rowSpans[rowSpans.length-1].y;
  let w=right-left,h=bottom-top;if(w<width*.38||h<height*.42)return null;
  const mx=Math.round(w*.055),my=Math.round(h*.08);let x=Math.max(0,left-mx),y=Math.max(0,top-my);
  w=Math.min(width-x,w+mx*2);h=Math.min(height-y,h+my*2);
  return {x,y,w,h};
}`;
if(!s.includes(old))throw new Error("receipt bounds block not found");
s=s.replace(old,next);fs.writeFileSync(path,s);console.log("receipt bounds refined");
