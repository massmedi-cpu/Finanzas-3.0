function parseVersion(value){
  const match=String(value||"").match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match?match.slice(1).map(Number):null;
}

export function versionAtLeast(current,baseline){
  const a=parseVersion(current),b=parseVersion(baseline);
  if(!a||!b)return false;
  for(let i=0;i<3;i++){
    if(a[i]>b[i])return true;
    if(a[i]<b[i])return false;
  }
  return true;
}
