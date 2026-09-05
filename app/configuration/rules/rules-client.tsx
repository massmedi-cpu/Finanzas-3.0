"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./rules.module.css";

type Rule = {
  id: string;
  name: string;
  status: "active" | "disabled";
  priority: number;
  concept_contains: string | null;
  merchant_id: string | null;
  account_id: string | null;
  category_id: string | null;
  minimum_amount_cents: number | string | null;
  maximum_amount_cents: number | string | null;
  target_category_id: string | null;
  target_merchant_id: string | null;
  merchant_name: string | null;
  account_name: string | null;
  category_name: string | null;
  target_category_name: string | null;
  target_merchant_name: string | null;
};

type Account = { id: string; name: string; lifecycle: "active" | "archived" };
type Category = { id: string; name: string; kind: string; lifecycle: "active" | "archived" };
type Merchant = { id: string; name: string; lifecycle: "active" | "archived" };
type Payload = { rules: Rule[]; accounts: Account[]; categories: Category[]; merchants: Merchant[] };

type RuleForm = {
  name: string;
  status: "active" | "disabled";
  priority: string;
  conceptContains: string;
  merchantId: string;
  accountId: string;
  categoryId: string;
  minimumAmount: string;
  maximumAmount: string;
  targetCategoryId: string;
  targetMerchantId: string;
};

const EMPTY_FORM: RuleForm = {
  name: "",
  status: "active",
  priority: "100",
  conceptContains: "",
  merchantId: "",
  accountId: "",
  categoryId: "",
  minimumAmount: "",
  maximumAmount: "",
  targetCategoryId: "",
  targetMerchantId: "",
};

const ERROR_MESSAGES: Record<string, string> = {
  rule_name_required: "Pon un nombre a la regla.",
  invalid_rule_status: "El estado de la regla no es válido.",
  invalid_rule_priority: "La prioridad debe ser un entero entre 0 y 1.000.000.",
  rule_condition_required: "Añade al menos una condición.",
  rule_target_required: "Selecciona al menos un resultado: categoría o comercio.",
  invalid_rule_amount_range: "El importe mínimo no puede superar al máximo.",
  rule_account_not_found: "La cuenta seleccionada ya no existe.",
  rule_merchant_not_found: "El comercio de condición ya no existe.",
  rule_category_not_found: "La categoría de condición ya no existe.",
  rule_target_merchant_not_active: "El comercio de destino debe estar activo.",
  rule_target_category_not_active: "La categoría de destino debe estar activa.",
  transaction_not_found: "El movimiento indicado no existe.",
};

function errorMessage(payload: any) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  return ERROR_MESSAGES[code] ?? "No se pudo completar la operación.";
}

async function ruleRequest(operation: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/rules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data));
  return data;
}

function amountToInput(value: number | string | null) {
  if (value === null || value === undefined) return "";
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) return "";
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseEuroCents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Usa un importe válido, por ejemplo -25,50.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("El importe queda fuera del rango permitido.");
  return cents;
}

function describeCondition(rule: Rule) {
  const parts: string[] = [];
  if (rule.concept_contains) parts.push(`Concepto contiene “${rule.concept_contains}”`);
  if (rule.account_name) parts.push(`Cuenta: ${rule.account_name}`);
  if (rule.merchant_name) parts.push(`Comercio: ${rule.merchant_name}`);
  if (rule.category_name) parts.push(`Categoría: ${rule.category_name}`);
  if (rule.minimum_amount_cents !== null) parts.push(`Desde ${amountToInput(rule.minimum_amount_cents)} €`);
  if (rule.maximum_amount_cents !== null) parts.push(`Hasta ${amountToInput(rule.maximum_amount_cents)} €`);
  return parts.join(" · ");
}

function describeTarget(rule: Rule) {
  return [
    rule.target_merchant_name ? `Comercio → ${rule.target_merchant_name}` : null,
    rule.target_category_name ? `Categoría → ${rule.target_category_name}` : null,
  ].filter(Boolean).join(" · ");
}

export default function RulesClient() {
  const [data, setData] = useState<Payload>({ rules: [], accounts: [], categories: [], merchants: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [transactionId, setTransactionId] = useState("");
  const [explanation, setExplanation] = useState<any>(null);
  const [applyResult, setApplyResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rules", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo leer el motor de reglas persistente.");
      const payload = (await response.json()) as Payload;
      setData({
        rules: Array.isArray(payload.rules) ? payload.rules : [],
        accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
        categories: Array.isArray(payload.categories) ? payload.categories : [],
        merchants: Array.isArray(payload.merchants) ? payload.merchants : [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar Reglas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCategories = useMemo(() => data.categories.filter((item) => item.lifecycle === "active"), [data.categories]);
  const activeMerchants = useMemo(() => data.merchants.filter((item) => item.lifecycle === "active"), [data.merchants]);
  const filteredRules = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-ES");
    if (!term) return data.rules;
    return data.rules.filter((rule) => `${rule.name} ${describeCondition(rule)} ${describeTarget(rule)}`.toLocaleLowerCase("es-ES").includes(term));
  }, [data.rules, search]);
  const activeRuleCount = data.rules.filter((rule) => rule.status === "active").length;

  function beginNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    document.getElementById("rule-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function beginEdit(rule: Rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      status: rule.status,
      priority: String(rule.priority),
      conceptContains: rule.concept_contains ?? "",
      merchantId: rule.merchant_id ?? "",
      accountId: rule.account_id ?? "",
      categoryId: rule.category_id ?? "",
      minimumAmount: amountToInput(rule.minimum_amount_cents),
      maximumAmount: amountToInput(rule.maximum_amount_cents),
      targetCategoryId: rule.target_category_id ?? "",
      targetMerchantId: rule.target_merchant_id ?? "",
    });
    setNotice(null);
    document.getElementById("rule-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submitRule(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const priority = Number(form.priority);
      if (!Number.isInteger(priority)) throw new Error("La prioridad debe ser un número entero.");
      const minimumAmountCents = parseEuroCents(form.minimumAmount);
      const maximumAmountCents = parseEuroCents(form.maximumAmount);
      await ruleRequest("rule.save", {
        id: editingId,
        name: form.name,
        status: form.status,
        priority,
        conceptContains: form.conceptContains || null,
        merchantId: form.merchantId || null,
        accountId: form.accountId || null,
        categoryId: form.categoryId || null,
        minimumAmountCents,
        maximumAmountCents,
        targetCategoryId: form.targetCategoryId || null,
        targetMerchantId: form.targetMerchantId || null,
      });
      await load();
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNotice("Regla guardada en el motor central. No se ha escrito nada en la fuente bancaria.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la regla.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: Rule) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await ruleRequest("rule.save", {
        id: rule.id,
        name: rule.name,
        status: rule.status === "active" ? "disabled" : "active",
        priority: rule.priority,
        conceptContains: rule.concept_contains,
        merchantId: rule.merchant_id,
        accountId: rule.account_id,
        categoryId: rule.category_id,
        minimumAmountCents: rule.minimum_amount_cents === null ? null : Number(rule.minimum_amount_cents),
        maximumAmountCents: rule.maximum_amount_cents === null ? null : Number(rule.maximum_amount_cents),
        targetCategoryId: rule.target_category_id,
        targetMerchantId: rule.target_merchant_id,
      });
      await load();
      setNotice(rule.status === "active" ? "Regla desactivada." : "Regla activada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado de la regla.");
    } finally {
      setBusy(false);
    }
  }

  async function evaluate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setExplanation(null);
    try {
      const result = await ruleRequest("rule.evaluate", { transactionId });
      setExplanation(result.result ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo simular el movimiento.");
    } finally {
      setBusy(false);
    }
  }

  async function applyAll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setApplyResult(null);
    try {
      const result = await ruleRequest("rule.apply_all", { limit: 10000 });
      setApplyResult(result.result ?? null);
      const evaluated = result.result?.evaluated ?? 0;
      const matched = result.result?.matched ?? 0;
      setNotice(`Motor aplicado: ${evaluated} movimientos evaluados y ${matched} coincidencias. Los cambios quedan en Financial App, nunca en la fuente bancaria.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron aplicar las reglas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FASE 3 · MOTOR CENTRAL DETERMINISTA</p>
          <h1>Reglas de categorización</h1>
          <p className={styles.copy}>Una sola lógica decide por prioridad y combina concepto, cuenta, importe, comercio y categoría. Los overrides manuales siempre tienen precedencia y la fuente bancaria sigue siendo de solo lectura.</p>
        </div>
        <div className={styles.summary} aria-label="Resumen de reglas">
          <div><strong>{activeRuleCount}</strong><span>Activas</span></div>
          <div><strong>{data.rules.length}</strong><span>Totales</span></div>
          <button type="button" onClick={() => void load()} disabled={loading || busy}>Actualizar</button>
        </div>
      </header>

      {error && <div className={`${styles.message} ${styles.error}`} role="alert">{error}</div>}
      {notice && <div className={`${styles.message} ${styles.success}`} role="status">{notice}</div>}

      <section className={styles.toolbar} aria-label="Herramientas de reglas">
        <label>
          <span>Buscar regla</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Concepto, cuenta, comercio…" />
        </label>
        <button type="button" onClick={beginNew} disabled={busy}>+ Nueva regla</button>
        <button className={styles.applyButton} type="button" onClick={() => void applyAll()} disabled={busy || activeRuleCount === 0}>Aplicar reglas</button>
      </section>

      {applyResult && (
        <section className={styles.resultStrip} aria-label="Resultado de aplicación">
          <span><strong>{applyResult.evaluated ?? 0}</strong> evaluados</span>
          <span><strong>{applyResult.matched ?? 0}</strong> con regla</span>
          <span><strong>{applyResult.merchantChanged ?? 0}</strong> comercios actualizados</span>
          <span><strong>{applyResult.categoryChanged ?? 0}</strong> categorías actualizadas</span>
        </section>
      )}

      {loading ? <section className={styles.panel}>Leyendo reglas persistentes…</section> : (
        <div className={styles.layout}>
          <section className={styles.panel} aria-labelledby="rule-list-heading">
            <div className={styles.panelHeading}>
              <div><p className={styles.kicker}>ORDEN DE EJECUCIÓN</p><h2 id="rule-list-heading">Reglas</h2></div>
              <span>{filteredRules.length}</span>
            </div>
            <p className={styles.helper}>Menor número = mayor prioridad. En empate decide el ID persistente, por lo que el resultado siempre es reproducible.</p>
            <div className={styles.ruleList}>
              {filteredRules.length === 0 ? <p className={styles.empty}>No hay reglas que coincidan.</p> : filteredRules.map((rule) => (
                <article key={rule.id} className={`${styles.ruleCard} ${rule.status === "disabled" ? styles.disabled : ""}`}>
                  <div className={styles.ruleTop}>
                    <div>
                      <span className={styles.priority}>P{rule.priority}</span>
                      <h3>{rule.name}</h3>
                    </div>
                    <span className={rule.status === "active" ? styles.activeBadge : styles.disabledBadge}>{rule.status === "active" ? "Activa" : "Desactivada"}</span>
                  </div>
                  <p><strong>Si:</strong> {describeCondition(rule)}</p>
                  <p><strong>Entonces:</strong> {describeTarget(rule)}</p>
                  <div className={styles.cardActions}>
                    <button type="button" onClick={() => beginEdit(rule)} disabled={busy}>Editar</button>
                    <button type="button" onClick={() => void toggleRule(rule)} disabled={busy}>{rule.status === "active" ? "Desactivar" : "Activar"}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.sideStack}>
            <section id="rule-form" className={styles.panel} aria-labelledby="rule-form-heading">
              <div className={styles.panelHeading}><div><p className={styles.kicker}>DEFINICIÓN</p><h2 id="rule-form-heading">{editingId ? "Editar regla" : "Nueva regla"}</h2></div></div>
              <form className={styles.form} onSubmit={submitRule}>
                <label><span>Nombre</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
                <div className={styles.formRow}>
                  <label><span>Prioridad</span><input type="number" min="0" max="1000000" step="1" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} required /></label>
                  <label><span>Estado</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RuleForm["status"] })}><option value="active">Activa</option><option value="disabled">Desactivada</option></select></label>
                </div>

                <fieldset><legend>Condiciones · todas deben cumplirse</legend>
                  <label><span>Concepto contiene</span><input value={form.conceptContains} onChange={(event) => setForm({ ...form, conceptContains: event.target.value })} placeholder="Ej. supermercado" /></label>
                  <label><span>Cuenta</span><select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}><option value="">Cualquiera</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Comercio</span><select value={form.merchantId} onChange={(event) => setForm({ ...form, merchantId: event.target.value })}><option value="">Cualquiera</option>{data.merchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Categoría actual</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Cualquiera</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <div className={styles.formRow}>
                    <label><span>Importe mínimo (€)</span><input inputMode="decimal" value={form.minimumAmount} onChange={(event) => setForm({ ...form, minimumAmount: event.target.value })} placeholder="-100,00" /></label>
                    <label><span>Importe máximo (€)</span><input inputMode="decimal" value={form.maximumAmount} onChange={(event) => setForm({ ...form, maximumAmount: event.target.value })} placeholder="-10,00" /></label>
                  </div>
                </fieldset>

                <fieldset><legend>Resultado</legend>
                  <label><span>Asignar comercio</span><select value={form.targetMerchantId} onChange={(event) => setForm({ ...form, targetMerchantId: event.target.value })}><option value="">No cambiar</option>{activeMerchants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Asignar categoría</span><select value={form.targetCategoryId} onChange={(event) => setForm({ ...form, targetCategoryId: event.target.value })}><option value="">Usar categoría del comercio / no cambiar</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </fieldset>

                <div className={styles.formActions}>
                  <button className={styles.primary} type="submit" disabled={busy}>{editingId ? "Guardar cambios" : "Crear regla"}</button>
                  {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} disabled={busy}>Cancelar</button>}
                </div>
              </form>
            </section>

            <section className={styles.panel} aria-labelledby="explain-heading">
              <div className={styles.panelHeading}><div><p className={styles.kicker}>AUDITABLE</p><h2 id="explain-heading">Simular movimiento</h2></div></div>
              <form className={styles.form} onSubmit={evaluate}>
                <label><span>ID del movimiento</span><input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="UUID" required /></label>
                <button type="submit" disabled={busy}>Explicar decisión</button>
              </form>
              {explanation && <pre className={styles.explanation}>{JSON.stringify(explanation, null, 2)}</pre>}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
