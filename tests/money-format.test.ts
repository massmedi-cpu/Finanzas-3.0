import { describe, expect, it } from "vitest";
import { formatMoney, parseSpanishMoneyToCents } from "@/lib/finance/format";
describe("formato financiero español",()=>{it("interpreta importes de la fuente",()=>{expect(parseSpanishMoneyToCents("1.263,20 €")).toBe(126320);expect(parseSpanishMoneyToCents("-39,57 €")).toBe(-3957)});it("formatea céntimos en EUR es-ES",()=>{expect(formatMoney(126320)).toMatch(/1\.263,20\s?€/)})});
