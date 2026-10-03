import { readFileSync } from "node:fs";

const home = readFileSync("src/design/financial-bar-chart.tsx", "utf8");
const accounts = readFileSync("app/accounts/accounts-client.tsx", "utf8");
const accountsCss = readFileSync("app/accounts/accounts.module.css", "utf8");
const trend = readFileSync("src/design/financial-trend-chart.tsx", "utf8");
const forecast = readFileSync("src/design/forecast-balance-chart.tsx", "utf8");

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`REL-064 missing ${label}: ${text}`);
};

requireText(home, "financial-bar-scale-reference", "Home scale reference");
requireText(home, "Escala máxima", "Home visible scale copy");
requireText(home, "Escala protegida por privacidad", "Home privacy-safe scale copy");
requireText(home, 'aria-label="Leyenda y escala de ingresos y gastos"', "Home accessible legend and scale");
requireText(accounts, "accounts-monthly-scale-reference", "Accounts scale reference");
requireText(accounts, "Escala máxima {formatMoney(scale)}", "Accounts numeric maximum");
requireText(accounts, 'aria-label="Leyenda y escala de la actividad mensual"', "Accounts accessible legend and scale");
requireText(accounts, "aria-label={`${formatMonth(row.monthStart)}: ingresos", "Accounts exact monthly accessible summary");
requireText(accountsCss, ".barTrack:nth-child(3) .netBar{left:50%;transform-origin:left center}", "positive net right of zero");
requireText(accountsCss, ".barTrack:nth-child(3) .negativeBar{right:50%;transform-origin:right center}", "negative net left of zero");
requireText(trend, "const ticks = Array.from({ length: 5 }", "Analysis scale ticks");
requireText(trend, "Datos de la comparativa financiera", "Analysis table alternative");
requireText(forecast, "Datos de la curva de saldo", "Forecast table alternative");

console.log("REL-064 VIZ-006/VIZ-007 visualization scale and accessibility contract: OK");
