import fs from "node:fs";

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function requireMissing(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const transactions = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");

requireMatch(transactions, /const replaceRequestSequence = useRef\(0\);/, "replace request sequence is missing");
requireMatch(transactions, /const appendRequestSequence = useRef\(0\);/, "append request sequence is missing");
requireMatch(transactions, /replaceAbortController = useRef<AbortController \| null>\(null\)/, "replace AbortController is missing");
requireMatch(transactions, /appendAbortController = useRef<AbortController \| null>\(null\)/, "append AbortController is missing");
requireMatch(transactions, /if \(append && replaceAbortController\.current\) return;/, "append must be blocked while replace is active");
requireMatch(transactions, /appendAbortController\.current\?\.abort\(\);/, "replace must abort stale append requests");
requireMatch(transactions, /signal: controller\.signal/, "transaction fetches must use AbortController signal");
requireMatch(transactions, /controller\.signal\.aborted \|\| !isCurrentRequest\(\)/, "aborted responses must not mutate list state");
requireMissing(transactions, /listRequestSequence/, "legacy shared request sequence must be removed");

for (const version of ["10.0.66", "10.0.67", "10.0.68"]) {
  const workflow = fs.readFileSync(`.github/workflows/release-${version}.yml`, "utf8");
  requireMissing(
    workflow,
    /^\s*pull_request:\s*$/m,
    `historical release ${version} must not run for every future PR`,
  );
  requireMatch(workflow, /workflow_dispatch:/, `historical release ${version} must remain manually runnable`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.version !== "10.0.70") throw new Error(`package version must be 10.0.70, got ${pkg.version}`);

console.log("REL-070 transactions concurrency and historical CI scoping contract: OK");
