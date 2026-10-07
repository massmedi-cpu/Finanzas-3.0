import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const login = read("app/login/page.tsx");
const postflight = read("tests/e2e/production-postflight.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 98];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.98+, recibida ${pkg.version}`);

requireText(login, '<main id="main-content" className="reset-screen">', "Acceso · landmark principal");
requireText(login, 'aria-labelledby="login-title"', "Acceso · nombre accesible");
requireText(postflight, 'page.locator("#main-content").getByText("Esta aplicación contiene información financiera personal.")', "Postflight · contrato de acceso");

console.log(`Financial App ${pkg.version} · landmark principal de acceso: OK`);
