import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const review = read("app/review/review-client.tsx");
const shell = read("app/app-shell.tsx");
const recurrences = read("app/recurrences/recurrences-client.tsx");
const transactions = read("app/transactions/transactions-client.tsx");
const errorBoundary = read("app/error.tsx");
const login = read("app/login/login-form.tsx");

requireMatch(review, /CENTRO DE ACCIÓN/, "UX-002: falta el centro unificado Para revisar");
requireMatch(review, /\/transactions\?reviewState=needs_review/, "UX-002: falta deep-link a movimientos por revisar");
requireMatch(review, /\/configuration\/source/, "UX-002: falta señal de fuente bancaria");

requireMatch(shell, /Navegación principal/, "UX-003: falta navegación primaria persistente");
requireMatch(shell, /Navegación móvil/, "UX-003: falta navegación móvil persistente");

requireMatch(recurrences, /Actualizar y ver impacto en Previsión/, "UX-004: falta retorno contextual a Previsión");
requireMatch(recurrences, /forecastImpactHref/, "UX-004: falta deep-link de impacto de recurrencia");

requireMatch(transactions, /pendingFocusId/, "UX-005: falta ancla de continuidad tras guardar");
requireMatch(transactions, /data-transaction-id=\{row\.id\}/, "UX-005: las filas no exponen ancla recuperable");
requireMatch(transactions, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/, "UX-005: falta restaurar el contexto visual");
requireMatch(transactions, /ya no está en el tramo visible o dejó de coincidir con los filtros actuales/, "UX-005: falta explicar por qué un movimiento guardado puede desaparecer");

requireMatch(errorBoundary, /Reintentar/, "UX-006: falta recuperación global por reintento");
requireMatch(errorBoundary, /Volver a Inicio/, "UX-006: falta alternativa segura de recuperación");

requireMatch(transactions, /const filtersDirty = useMemo/, "UX-007: falta distinguir filtros editados de aplicados");
requireMatch(transactions, /Cambios sin aplicar/, "UX-007: falta feedback explícito de filtros pendientes");
requireMatch(transactions, /disabled=\{saving \|\| !filtersDirty\}/, "UX-007: Aplicar debe deshabilitarse sin cambios");
requireMatch(transactions, /La tabla refleja estos filtros/, "UX-007: falta confirmar el estado aplicado");

requireMatch(login, /LOGIN_ERROR_ID/, "UX-009: falta id estable del error de login");
requireMatch(login, /aria-describedby=\{message \? LOGIN_ERROR_ID : undefined\}/, "UX-009: el error no está asociado al formulario/campos");
requireMatch(login, /aria-invalid=\{credentialError \? "true" : undefined\}/, "UX-009: falta marcar credenciales inválidas sin enumerarlas");
requireMatch(login, /errorRef\.current\?\.focus\(\)/, "UX-009: falta foco predecible al error");
requireMatch(login, /tabIndex=\{-1\}/, "UX-009: el aviso no es enfocables programáticamente");

console.log("UX continuity 10.0.66: OK");
