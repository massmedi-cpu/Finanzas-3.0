import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const accessControl = readFileSync("src/infrastructure/auth/access-control.ts", "utf8");
const supabaseAuth = readFileSync("src/infrastructure/auth/supabase-auth.ts", "utf8");
const googleOauth = readFileSync("src/infrastructure/google/google-oauth.ts", "utf8");
const bankReader = readFileSync("src/infrastructure/google/official-bank-source-reader.ts", "utf8");

test("CR-003 · Production exige autenticación y la sesión usa cookies esenciales protegidas", () => {
  expect(accessControl).toContain('env.VERCEL_ENV === "production"');
  expect(supabaseAuth).toContain("httpOnly: true");
  expect(supabaseAuth).toContain('sameSite: "lax"');
  expect(supabaseAuth).toContain('const secure = process.env.NODE_ENV === "production"');
  expect(supabaseAuth).toContain("secure,");
});

test("CR-003 · Google limita la integración a identidad básica y permisos de lectura", () => {
  expect(googleOauth).toContain('GOOGLE_OAUTH_IDENTITY_SCOPES = ["openid", "email"]');
  expect(bankReader).toContain('"https://www.googleapis.com/auth/spreadsheets.readonly"');
  expect(bankReader).toContain('"https://www.googleapis.com/auth/drive.metadata.readonly"');
  expect(bankReader).not.toContain('"https://www.googleapis.com/auth/drive"');
  expect(bankReader).not.toContain('"https://www.googleapis.com/auth/spreadsheets"');
});
