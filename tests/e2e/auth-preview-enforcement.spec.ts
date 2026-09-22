import { expect, test } from "@playwright/test";
import {
  isPublicAuthPath,
  shouldEnforceAppAuth,
} from "../../src/infrastructure/auth/access-control";

test("Vercel Preview requires the same Financial App session boundary as Production", () => {
  expect(shouldEnforceAppAuth({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv)).toBe(true);
  expect(shouldEnforceAppAuth({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  expect(shouldEnforceAppAuth({ VERCEL_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  expect(shouldEnforceAppAuth({
    VERCEL_ENV: "development",
    FINANCIAL_APP_AUTH_ENFORCED: "true",
  } as NodeJS.ProcessEnv)).toBe(true);
});

test("Preview auth keeps the login and build provenance endpoints public", () => {
  expect(isPublicAuthPath("/login")).toBe(true);
  expect(isPublicAuthPath("/api/build")).toBe(true);
  expect(isPublicAuthPath("/api/auth/login")).toBe(true);
  expect(isPublicAuthPath("/documents")).toBe(false);
  expect(isPublicAuthPath("/api/documents")).toBe(false);
});
