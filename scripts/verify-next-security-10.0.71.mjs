import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === "10.0.71", `package version must be 10.0.71, got ${pkg.version}`);
assert(pkg.dependencies?.next === "16.3.8", `Next.js must be pinned to 16.3.8, got ${pkg.dependencies?.next}`);
assert(lock.version === "10.0.71", `lockfile version must be 10.0.71, got ${lock.version}`);
assert(lock.packages?.[""]?.version === "10.0.71", "root lock package version must be 10.0.71");
assert(lock.packages?.[""]?.dependencies?.next === "16.3.8", "root lock dependency must pin Next.js 16.3.8");
assert(lock.packages?.["node_modules/next"]?.version === "16.3.8", `resolved Next.js must be 16.3.8, got ${lock.packages?.["node_modules/next"]?.version}`);
assert(vercel.git?.deploymentEnabled === false, "Git deployments must remain closed while REL-071 is under certification");

console.log("REL-071 Next.js critical security patch contract: OK");
