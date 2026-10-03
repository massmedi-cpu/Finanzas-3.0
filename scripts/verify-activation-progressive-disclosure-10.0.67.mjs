import fs from "node:fs";

const onboarding = fs.readFileSync("app/onboarding/onboarding-client.tsx", "utf8");
const onboardingCss = fs.readFileSync("app/onboarding/onboarding.module.css", "utf8");
const sourceOverview = fs.readFileSync("app/configuration/source/source-overview-client.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks = [
  [pkg.version === "10.0.67", "package version must be 10.0.67"],
  [onboarding.includes("Conecta tus movimientos"), "activation must start from connecting movements"],
  [onboarding.includes("Comprueba que están bien"), "activation must include data verification"],
  [onboarding.includes("Confirma tus cuentas"), "activation must include account confirmation"],
  [onboarding.includes("Mira tu primer resumen"), "activation must lead to first financial summary"],
  [onboarding.includes("Revisa lo que necesita tu decisión"), "activation must end in actionable review"],
  [onboarding.includes("SIGUIENTE PASO"), "activation must expose one dominant next action"],
  [onboarding.includes('data-activation-complete={activationComplete ? "true" : "false"}'), "activation completion must be machine-testable"],
  [onboarding.includes("Qué comprueba Financial App por detrás"), "technical explanation must remain available on demand"],
  [onboarding.includes("<details className={styles.technicalDetails}>"), "technical explanation must use progressive disclosure"],
  [onboarding.includes("/configuration/source/diagnostics"), "technical diagnostics must remain reachable"],
  [onboarding.includes("No guarda un progreso paralelo"), "onboarding must not introduce a second source of truth"],
  [onboardingCss.includes(".nextAction"), "next action must have explicit visual hierarchy"],
  [onboardingCss.includes(".technicalDetails"), "progressive disclosure must have dedicated styling"],
  [sourceOverview.includes('href="/configuration/source/diagnostics"'), "source diagnostics must remain separated from the primary source workflow"],
  [sourceOverview.includes("Detalles técnicos"), "source workflow must keep an explicit technical-details escape hatch"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error("REL-067 activation/progressive-disclosure verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("REL-067 activation/progressive-disclosure contract verified.");
