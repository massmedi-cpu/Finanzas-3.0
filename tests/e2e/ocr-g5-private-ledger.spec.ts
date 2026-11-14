import { expect, test } from "@playwright/test";
import { assertInspectedG5Ledger } from "./support/g5-private-inspection-ledger";

test("REC-G5-319 · SHA256 ledger accepts only previously inspected exact private PDFs", () => {
  const rows = Array.from({ length: 17 }, (_, i) => ({
    name: "synthetic-invoice-" + String(i + 1).padStart(2, "0") + ".pdf",
    sha256: (i + 1).toString(16).padStart(64, "0"),
    previouslyInspected: true,
  }));
  const observed = rows.map(({name,sha256}) => ({name,sha256}));
  const ledger = (documents: unknown) => ({schemaVersion:1,documents});
  const invalid = (documents: unknown, seen = observed) => {
    expect(() => assertInspectedG5Ledger(ledger(documents),seen))
      .toThrow("g5_private_inspection_ledger_invalid");
  };
  expect(() => assertInspectedG5Ledger(ledger(rows),observed)).not.toThrow();
  invalid(rows.map((r,i)=>i===0?{...r,previouslyInspected:false}:r));
  invalid(rows.map((r,i)=>i===0?{...r,sha256:"0".repeat(64)}:r));
  invalid([...rows.slice(1),rows[1]]);
  invalid(rows,observed.slice(1));
  invalid(rows,[...observed.slice(1),{...observed[0],name:"unknown.pdf"}]);
  invalid(rows,[...observed.slice(1),{...observed[0],sha256:"f".repeat(64)}]);
  invalid(rows.map((r,i)=>i===0?{...r,name:"../unopened.pdf"}:r));
  invalid(rows.map((r,i)=>i===0?{...r,name:"private\\hidden.pdf"}:r));
  invalid(rows.map((r,i)=>i===0?{...r,name:"../source.txt"}:r));
});
