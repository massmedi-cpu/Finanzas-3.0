import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-pre032-category-identity.mjs";
const source = readFileSync(path, "utf8");
const marker = "const auditDoc = `";
const start = source.indexOf(marker);
if (start < 0) throw new Error("PRE-032 auditDoc start marker missing");
const bodyStart = start + marker.length;
const endMarker = "`;\nwrite(\"docs/audits/axioma-62-71-20261001.md\", auditDoc);";
const end = source.indexOf(endMarker, bodyStart);
if (end < 0) throw new Error("PRE-032 auditDoc end marker missing");
const body = source.slice(bodyStart, end);
const repairedBody = body.replaceAll("`", "'");
if (body === repairedBody) throw new Error("PRE-032 patcher did not contain the expected nested backticks");
writeFileSync(path, source.slice(0, bodyStart) + repairedBody + source.slice(end), "utf8");
console.log(`PRE-032 patcher source repaired: ${body.split("`").length - 1} nested backticks replaced.`);
