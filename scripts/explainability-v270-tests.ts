import assert from "node:assert/strict";
import { resolveClassificationOrigin } from "../lib/financial/classification-origin";
import { suggestionRulePayload,type ExplainabilitySuggestion } from "../lib/financial/explainability-shared";

const base={splitCount:0,categoryOverride:null,subcategoryOverride:null,counterpartyOverride:null,ruleControlsCategory:false,ruleControlsSubcategory:false};
assert.equal(resolveClassificationOrigin(base).origin,"source");
assert.equal(resolveClassificationOrigin({...base,ruleControlsCategory:true}).origin,"rule");
assert.equal(resolveClassificationOrigin({...base,ruleControlsCategory:true,counterpartyOverride:"Privado"}).origin,"manual");
assert.equal(resolveClassificationOrigin({...base,splitCount:2,categoryOverride:"Manual",ruleControlsCategory:true}).origin,"split");

const suggestion:ExplainabilitySuggestion={id:"x",merchant:"Comercio",direction:"expense",targetCategory:"Alimentación",targetSubcategory:"Supermercado",matched:12,dominantMatches:11,confidence:.917,samples:[]};
const rule=suggestionRulePayload(suggestion);
assert.equal(rule.match_counterparty,"Comercio");
assert.equal(rule.counterparty_operator,"equals");
assert.equal(rule.direction,"expense");
assert.equal(rule.set_category,"Alimentación");
assert.equal(rule.set_subcategory,"Supermercado");
assert.equal(rule.stop_processing,true);

console.log("Financial App 2.7 tests OK · precedencia determinista y sugerencias preview-first");
