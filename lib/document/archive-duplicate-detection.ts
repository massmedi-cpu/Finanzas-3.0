import type { ArchiveDocument } from "@/lib/financial/archive";

export type ArchiveDuplicateConfidence="exact"|"high"|"possible";
export type ArchiveDuplicateReason="same_hash"|"same_date"|"same_amount"|"same_size"|"merchant_overlap";
export type ArchiveDuplicateCandidate={
  id:string;
  confidence:ArchiveDuplicateConfidence;
  score:number;
  reasons:ArchiveDuplicateReason[];
  left:ArchiveDocument;
  right:ArchiveDocument;
};

const STOPWORDS=new Set(["de","del","la","el","los","las","y","sl","sa","slu","sll","sc","coop","soc","sociedad","bar","restaurante","tienda"]);

function normalize(value:string|null|undefined){
  return String(value||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function merchantTokens(value:string|null|undefined){
  return normalize(value).split(/\s+/).filter(token=>token.length>=3&&!STOPWORDS.has(token));
}

export function merchantOverlap(left:string|null|undefined,right:string|null|undefined){
  const a=new Set(merchantTokens(left));
  const b=new Set(merchantTokens(right));
  if(!a.size||!b.size)return 0;
  let shared=0;
  for(const token of a)if(b.has(token))shared+=1;
  return shared/Math.min(a.size,b.size);
}

function sameAmount(left:ArchiveDocument,right:ArchiveDocument){
  return left.amount!=null&&right.amount!=null&&Math.abs(Number(left.amount)-Number(right.amount))<0.005;
}

function sameDate(left:ArchiveDocument,right:ArchiveDocument){return Boolean(left.documentDate&&right.documentDate&&left.documentDate===right.documentDate);}
function sameSize(left:ArchiveDocument,right:ArchiveDocument){return Boolean(left.fileSize&&right.fileSize&&left.fileSize===right.fileSize);}
function sameHash(left:ArchiveDocument,right:ArchiveDocument){return Boolean(left.contentHash&&right.contentHash&&left.contentHash===right.contentHash);}

export function detectArchiveDuplicateCandidates(documents:ArchiveDocument[]):ArchiveDuplicateCandidate[]{
  const candidates:ArchiveDuplicateCandidate[]=[];
  for(let i=0;i<documents.length;i++){
    const left=documents[i];
    for(let j=i+1;j<documents.length;j++){
      const right=documents[j];
      const hash=sameHash(left,right);
      const date=sameDate(left,right);
      const amount=sameAmount(left,right);
      const size=sameSize(left,right);
      const overlap=merchantOverlap(left.merchant,right.merchant);
      const reasons:ArchiveDuplicateReason[]=[];
      if(hash)reasons.push("same_hash");
      if(date)reasons.push("same_date");
      if(amount)reasons.push("same_amount");
      if(size)reasons.push("same_size");
      if(overlap>=0.6)reasons.push("merchant_overlap");

      let confidence:ArchiveDuplicateConfidence|null=null;
      let score=0;
      if(hash){confidence="exact";score=100;}
      else if(date&&amount&&size){confidence="high";score=92+(overlap>=0.6?4:0);}
      else if(date&&amount&&overlap>=0.6){confidence="possible";score=76;}
      if(!confidence)continue;
      candidates.push({
        id:[left.id,right.id].sort().join(":"),
        confidence,
        score,
        reasons,
        left,
        right,
      });
    }
  }
  return candidates.sort((a,b)=>b.score-a.score||String(b.left.updatedAt).localeCompare(String(a.left.updatedAt)));
}

export function duplicateDocumentCanBeDeleted(document:ArchiveDocument){return document.links.length===0;}
