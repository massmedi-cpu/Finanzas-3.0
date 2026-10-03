import fs from "node:fs";

const source = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const scopedHeaders = source.match(/<th(?:\s+[^>]*)?scope="col"[^>]*>/g) ?? [];

const checks = [
  [pkg.version === "10.0.68", "package version must be 10.0.68"],
  [source.includes('const SUBCATEGORY_ERROR_ID = "transaction-subcategory-error";'), "subcategory error must expose a stable id"],
  [source.includes("const subcategorySelectRef = useRef<HTMLSelectElement>(null);"), "subcategory select must have a focus ref"],
  [source.includes("conceptInputRef.current?.focus()"), "opening the editor must move focus to the primary concept field"],
  [source.includes("subcategorySelectRef.current?.focus()"), "subcategory validation must move focus to the invalid control"],
  [source.includes("aria-describedby={categoryError ? SUBCATEGORY_ERROR_ID : undefined}"), "subcategory validation must describe the invalid control"],
  [source.includes("id={SUBCATEGORY_ERROR_ID}"), "subcategory error node must expose its id"],
  [scopedHeaders.length >= 7, "transaction table headers must expose scope=col"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error("REL-068 accessibility verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("REL-068 accessibility contract verified.");
