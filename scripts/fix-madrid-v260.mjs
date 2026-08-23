import { readFileSync, writeFileSync } from "node:fs";

const changes=[
  {
    path:"app/prevision/forecast-client.tsx",
    replacements:[
      ['import { formatEuro } from "@/lib/format/es-es";','import { formatEuro } from "@/lib/format/es-es";\nimport { madridToday } from "@/lib/time/madrid";'],
      ['date:new Date().toISOString().slice(0,10)','date:madridToday()'],
    ],
  },
  {
    path:"lib/financial/budget.ts",
    replacements:[
      ['import { APP_VERSION } from "@/lib/app-version";','import { APP_VERSION } from "@/lib/app-version";\nimport { madridToday } from "@/lib/time/madrid";'],
      ['new Date().toISOString().slice(0,10)','madridToday()'],
    ],
  },
  {
    path:"lib/financial/forecast.ts",
    replacements:[
      ['import { APP_VERSION } from "@/lib/app-version";','import { APP_VERSION } from "@/lib/app-version";\nimport { madridToday } from "@/lib/time/madrid";'],
      ['p_start:new Date().toISOString().slice(0,10)','p_start:madridToday()'],
    ],
  },
  {
    path:"lib/financial/goals.ts",
    replacements:[
      ['import { APP_VERSION } from "@/lib/app-version";','import { APP_VERSION } from "@/lib/app-version";\nimport { madridToday } from "@/lib/time/madrid";'],
      ['raw.asOf||new Date().toISOString().slice(0,10)','raw.asOf||madridToday()'],
    ],
  },
  {
    path:"lib/financial/plan.ts",
    replacements:[
      ['import { APP_VERSION } from "@/lib/app-version";','import { APP_VERSION } from "@/lib/app-version";\nimport { madridMonth, madridToday } from "@/lib/time/madrid";'],
      ['raw?.asOf||new Date().toISOString().slice(0,10)','raw?.asOf||madridToday()'],
      ['raw?.month||new Date().toISOString().slice(0,7)','raw?.month||madridMonth()'],
      ['new Date().toISOString().slice(0,10)','madridToday()'],
    ],
  },
];

for(const {path,replacements} of changes){
  let text=readFileSync(path,"utf8");
  for(const [from,to] of replacements){
    if(!text.includes(from))throw new Error(`${path}: patrón no encontrado: ${from}`);
    text=text.replace(from,to);
  }
  writeFileSync(path,text);
}
console.log("Madrid calendar boundary migration applied");
