"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Account, AccountType, Category, CategoryKind, EntityId } from "../../src/domain/models";
import { formatMoneyCents, parseSpanishMoneyToCents } from "../../src/core/money";

type ConfigPayload = { accounts: Account[]; categories: Category[] };
type Tab = "accounts" | "categories";

type AccountForm = {
  name: string;
  institution: string;
  type: AccountType;
  openingBalance: string;
};

type CategoryForm = {
  name: string;
  kind: CategoryKind;
  iconKey: string;
  colorToken: string;
  parentCategoryId: string;
};

const INITIAL_ACCOUNT: AccountForm = {
  name: "",
  institution: "",
  type: "checking",
  openingBalance: "0,00",
};

const INITIAL_CATEGORY: CategoryForm = {
  name: "",
  kind: "expense",
  iconKey: "wallet",
  colorToken: "category.blue",
  parentCategoryId: "",
};

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "checking", label: "Cuenta corriente" },
  { value: "savings", label: "Ahorro" },
  { value: "credit", label: "Crédito" },
  { value: "cash", label: "Efectivo" },
  { value: "investment", label: "Inversión" },
  { value: "other", label: "Otra" },
];

const CATEGORY_KINDS: Array<{ value: CategoryKind; label: string }> = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

const ICONS = ["wallet", "home", "cart", "car", "heart", "briefcase", "gift", "bolt", "plane", "more"];
const COLORS = [
  "category.blue",
  "category.cyan",
  "category.green",
  "category.amber",
  "category.violet",
  "category.rose",
];

function labelForAccountType(type: AccountType) {
  return ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? type;
}

function labelForCategoryKind(kind: CategoryKind) {
  return CATEGORY_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

function sameCategoryGroup(left: Category, right: Category) {
  return left.kind === right.kind && left.parentCategoryId === right.parentCategoryId;
}

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 6v5h-5M4 18v-5h5" /><path d="M7.5 7.5A7 7 0 0 1 19 10M5 14a7 7 0 0 0 11.5 2.5" /></svg>;
  if (name === "edit") return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>;
  if (name === "archive") return <svg {...common}><path d="M3 6h18M5 6v14h14V6M9 10h6" /></svg>;
  if (name === "up") return <svg {...common}><path d="m18 15-6-6-6 6" /></svg>;
  if (name === "down") return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
  if (name === "merge") return <svg {...common}><path d="M7 4v4c0 2.2 1.8 4 4 4h6" /><path d="m14 9 3 3-3 3" /><path d="M7 20v-4c0-1.7 1-3.2 2.5-3.8" /></svg>;
  if (name === "account") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M9 12h6" /></svg>;
}

async function requestConfiguration(operation: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/configuration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data?.issues)
      ? data.issues.map((issue: { message?: string }) => issue.message).filter(Boolean).join(" ")
      : data?.message || data?.error || "No se pudo completar la operación.";
    throw new Error(message);
  }
  return data;
}

export default function ConfigurationClient() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [data, setData] = useState<ConfigPayload>({ accounts: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(INITIAL_ACCOUNT);
  const [editingAccountId, setEditingAccountId] = useState<EntityId | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(INITIAL_CATEGORY);
  const [editingCategoryId, setEditingCategoryId] = useState<EntityId | null>(null);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/configuration", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo leer la configuración persistente.");
      const payload = (await response.json()) as ConfigPayload;
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAccounts = useMemo(() => data.accounts.filter((item) => item.lifecycle === "active").length, [data.accounts]);
  const activeCategories = useMemo(() => data.categories.filter((item) => item.lifecycle === "active").length, [data.categories]);
  const parentOptions = useMemo(() => data.categories.filter((item) => item.lifecycle === "active" && item.kind === categoryForm.kind && item.id !== editingCategoryId), [data.categories, categoryForm.kind, editingCategoryId]);
  const mergeSources = useMemo(() => data.categories.filter((item) => item.lifecycle === "active"), [data.categories]);
  const selectedSource = data.categories.find((item) => item.id === mergeSource);
  const mergeTargets = useMemo(() => data.categories.filter((item) => item.lifecycle === "active" && item.id !== mergeSource && (!selectedSource || item.kind === selectedSource.kind)), [data.categories, mergeSource, selectedSource]);

  function beginAccountEdit(account: Account) {
    setEditingAccountId(account.id);
    setAccountForm({ name: account.name, institution: account.institution ?? "", type: account.type, openingBalance: formatMoneyCents(account.openingBalanceCents).replace(/\s?€/g, "") });
    setNotice(null);
    document.getElementById("account-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function beginCategoryEdit(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name, kind: category.kind, iconKey: category.iconKey, colorToken: category.colorToken, parentCategoryId: category.parentCategoryId ?? "" });
    setNotice(null);
    document.getElementById("category-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function canMoveCategory(index: number, delta: number) {
    const current = data.categories[index];
    const next = data.categories[index + delta];
    return Boolean(current && next && sameCategoryGroup(current, next));
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La operación no se pudo completar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    let openingBalanceCents: number;
    try {
      openingBalanceCents = parseSpanishMoneyToCents(accountForm.openingBalance);
    } catch {
      setError("El saldo inicial debe usar formato español, por ejemplo 1.234,56.");
      return;
    }
    const current = editingAccountId ? data.accounts.find((item) => item.id === editingAccountId) : null;
    const draft = {
      name: accountForm.name,
      institution: accountForm.institution.trim() || null,
      type: accountForm.type,
      openingBalanceCents,
      lifecycle: current?.lifecycle ?? "active",
      sortOrder: current?.sortOrder ?? data.accounts.length,
    };
    await run(async () => {
      await requestConfiguration(editingAccountId ? "account.update" : "account.create", editingAccountId ? { id: editingAccountId, draft } : { draft });
      setAccountForm(INITIAL_ACCOUNT);
      setEditingAccountId(null);
    }, editingAccountId ? "Cuenta actualizada." : "Cuenta creada y persistida.");
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    const current = editingCategoryId ? data.categories.find((item) => item.id === editingCategoryId) : null;
    const draft = {
      name: categoryForm.name,
      kind: categoryForm.kind,
      parentCategoryId: categoryForm.parentCategoryId || null,
      iconKey: categoryForm.iconKey,
      colorToken: categoryForm.colorToken,
      lifecycle: current?.lifecycle ?? "active",
      sortOrder: current?.sortOrder ?? data.categories.length,
    };
    await run(async () => {
      await requestConfiguration(editingCategoryId ? "category.update" : "category.create", editingCategoryId ? { id: editingCategoryId, draft } : { draft });
      setCategoryForm(INITIAL_CATEGORY);
      setEditingCategoryId(null);
    }, editingCategoryId ? "Categoría actualizada." : "Categoría creada y persistida.");
  }

  async function reorderAccounts(index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= data.accounts.length) return;
    const ordered = data.accounts.map((item) => item.id);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    await run(() => requestConfiguration("account.reorder", { orderedIds: ordered }).then(() => undefined), "Orden de cuentas actualizado.");
  }

  async function reorderCategories(index: number, delta: number) {
    const nextIndex = index + delta;
    if (!canMoveCategory(index, delta)) return;
    const ordered = data.categories.map((item) => item.id);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    await run(() => requestConfiguration("category.reorder", { orderedIds: ordered }).then(() => undefined), "Orden de categorías actualizado.");
  }

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <a className="back-link" href="/">← Fundamentos</a>
          <p className="eyebrow">FASE 1 · CONFIGURACIÓN PERSISTENTE</p>
          <h1>Cuentas y categorías</h1>
          <p className="hero-copy">Primera interfaz funcional conectada a PostgreSQL real mediante el canal server-only autenticado. Nada de esta pantalla escribe en la fuente bancaria.</p>
        </div>
        <div className="configuration-summary" aria-label="Resumen de configuración">
          <div><strong>{activeAccounts}</strong><span>Cuentas activas</span></div>
          <div><strong>{activeCategories}</strong><span>Categorías activas</span></div>
          <button className="icon-button" type="button" onClick={() => void load()} disabled={loading || busy} aria-label="Actualizar datos"><Icon name="refresh" /></button>
        </div>
      </header>

      <nav className="config-tabs" aria-label="Secciones de configuración">
        <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}><Icon name="account" />Cuentas <span>{data.accounts.length}</span></button>
        <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}><Icon name="more" />Categorías <span>{data.categories.length}</span></button>
      </nav>

      {error && <div className="config-message error" role="alert">{error}</div>}
      {notice && <div className="config-message success" role="status">{notice}</div>}

      {loading ? <section className="config-panel loading-state">Leyendo configuración persistente…</section> : tab === "accounts" ? (
        <div className="config-layout">
          <section className="config-panel list-panel" aria-labelledby="accounts-heading">
            <div className="panel-heading"><div><p className="panel-kicker">ORIGEN DEL DINERO</p><h2 id="accounts-heading">Cuentas</h2></div><span className="status-chip">PostgreSQL</span></div>
            {data.accounts.length === 0 ? <div className="empty-state"><Icon name="account" /><h3>Aún no hay cuentas</h3><p>Crea la primera cuenta. El registro se guardará en el nuevo Supabase exclusivo de Financial App.</p></div> : (
              <div className="entity-list">
                {data.accounts.map((account, index) => <article className={`entity-card ${account.lifecycle === "archived" ? "archived" : ""}`} key={account.id}>
                  <div className="entity-main"><div className="entity-icon"><Icon name="account" /></div><div><div className="entity-title-row"><h3>{account.name}</h3><span className={`lifecycle ${account.lifecycle}`}>{account.lifecycle === "active" ? "Activa" : "Archivada"}</span></div><p>{account.institution || "Sin entidad"} · {labelForAccountType(account.type)}</p><strong>{formatMoneyCents(account.openingBalanceCents)}</strong></div></div>
                  <div className="entity-actions">
                    <button type="button" className="icon-button" onClick={() => beginAccountEdit(account)} aria-label={`Editar ${account.name}`}><Icon name="edit" /></button>
                    <button type="button" className="icon-button" disabled={index === 0 || busy} onClick={() => void reorderAccounts(index, -1)} aria-label="Subir"><Icon name="up" /></button>
                    <button type="button" className="icon-button" disabled={index === data.accounts.length - 1 || busy} onClick={() => void reorderAccounts(index, 1)} aria-label="Bajar"><Icon name="down" /></button>
                    <button type="button" className="icon-button" disabled={busy} onClick={() => void run(() => requestConfiguration("account.archive", { id: account.id, archived: account.lifecycle === "active" }).then(() => undefined), account.lifecycle === "active" ? "Cuenta archivada." : "Cuenta reactivada.")} aria-label={account.lifecycle === "active" ? "Archivar" : "Reactivar"}><Icon name="archive" /></button>
                  </div>
                </article>)}
              </div>
            )}
          </section>

          <aside className="config-panel form-panel" id="account-form">
            <div className="panel-heading"><div><p className="panel-kicker">{editingAccountId ? "EDICIÓN" : "NUEVA CUENTA"}</p><h2>{editingAccountId ? "Editar cuenta" : "Añadir cuenta"}</h2></div></div>
            <form className="config-form" onSubmit={submitAccount}>
              <label>Nombre<input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Ej. Cuenta principal" /></label>
              <label>Entidad<input value={accountForm.institution} onChange={(e) => setAccountForm({ ...accountForm, institution: e.target.value })} placeholder="Ej. Openbank" /></label>
              <label>Tipo<select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as AccountType })}>{ACCOUNT_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
              <label>Saldo inicial <span className="field-hint">EUR · formato es-ES</span><input inputMode="decimal" required value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} placeholder="0,00" /></label>
              <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}><Icon name="plus" />{editingAccountId ? "Guardar cambios" : "Crear cuenta"}</button>{editingAccountId && <button className="secondary-button" type="button" onClick={() => { setEditingAccountId(null); setAccountForm(INITIAL_ACCOUNT); }}>Cancelar</button>}</div>
            </form>
          </aside>
        </div>
      ) : (
        <div className="config-layout">
          <section className="config-panel list-panel" aria-labelledby="categories-heading">
            <div className="panel-heading"><div><p className="panel-kicker">CLASIFICACIÓN</p><h2 id="categories-heading">Categorías</h2></div><span className="status-chip">Persistentes</span></div>
            {data.categories.length === 0 ? <div className="empty-state"><Icon name="more" /><h3>Aún no hay categorías</h3><p>Crea una categoría de gasto, ingreso o transferencia. La jerarquía y la unicidad se validan en dominio y base de datos.</p></div> : (
              <div className="entity-list">
                {data.categories.map((category, index) => <article className={`entity-card ${category.lifecycle === "archived" ? "archived" : ""}`} key={category.id}>
                  <div className="entity-main"><div className={`entity-icon category-swatch ${category.colorToken.replace(".", "-")}`}><Icon name="more" /></div><div><div className="entity-title-row"><h3>{category.name}</h3><span className={`lifecycle ${category.lifecycle}`}>{category.lifecycle === "active" ? "Activa" : "Archivada"}</span></div><p>{labelForCategoryKind(category.kind)}{category.parentCategoryId ? " · Subcategoría" : " · Principal"}</p><strong>{category.iconKey}</strong></div></div>
                  <div className="entity-actions">
                    <button type="button" className="icon-button" onClick={() => beginCategoryEdit(category)} aria-label={`Editar ${category.name}`}><Icon name="edit" /></button>
                    <button type="button" className="icon-button" disabled={busy || !canMoveCategory(index, -1)} onClick={() => void reorderCategories(index, -1)} aria-label="Subir dentro de su grupo"><Icon name="up" /></button>
                    <button type="button" className="icon-button" disabled={busy || !canMoveCategory(index, 1)} onClick={() => void reorderCategories(index, 1)} aria-label="Bajar dentro de su grupo"><Icon name="down" /></button>
                    <button type="button" className="icon-button" disabled={busy} onClick={() => void run(() => requestConfiguration("category.archive", { id: category.id, archived: category.lifecycle === "active" }).then(() => undefined), category.lifecycle === "active" ? "Categoría archivada." : "Categoría reactivada.")} aria-label={category.lifecycle === "active" ? "Archivar" : "Reactivar"}><Icon name="archive" /></button>
                  </div>
                </article>)}
              </div>
            )}
          </section>

          <aside className="configuration-side-stack">
            <section className="config-panel form-panel" id="category-form">
              <div className="panel-heading"><div><p className="panel-kicker">{editingCategoryId ? "EDICIÓN" : "NUEVA CATEGORÍA"}</p><h2>{editingCategoryId ? "Editar categoría" : "Añadir categoría"}</h2></div></div>
              <form className="config-form" onSubmit={submitCategory}>
                <label>Nombre<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Ej. Supermercado" /></label>
                <label>Tipo<select value={categoryForm.kind} onChange={(e) => setCategoryForm({ ...categoryForm, kind: e.target.value as CategoryKind, parentCategoryId: "" })}>{CATEGORY_KINDS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                <label>Categoría superior<select value={categoryForm.parentCategoryId} onChange={(e) => setCategoryForm({ ...categoryForm, parentCategoryId: e.target.value })}><option value="">Sin categoría superior</option>{parentOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <div className="form-row"><label>Icono<select value={categoryForm.iconKey} onChange={(e) => setCategoryForm({ ...categoryForm, iconKey: e.target.value })}>{ICONS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>Color<select value={categoryForm.colorToken} onChange={(e) => setCategoryForm({ ...categoryForm, colorToken: e.target.value })}>{COLORS.map((item) => <option value={item} key={item}>{item.replace("category.", "")}</option>)}</select></label></div>
                <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}><Icon name="plus" />{editingCategoryId ? "Guardar cambios" : "Crear categoría"}</button>{editingCategoryId && <button className="secondary-button" type="button" onClick={() => { setEditingCategoryId(null); setCategoryForm(INITIAL_CATEGORY); }}>Cancelar</button>}</div>
              </form>
            </section>

            <section className="config-panel merge-panel">
              <div className="panel-heading"><div><p className="panel-kicker">MANTENIMIENTO</p><h2>Fusionar categorías</h2></div><Icon name="merge" /></div>
              <p>La categoría origen se archiva y sus referencias pasan a la de destino. No se combinan presupuestos incompatibles por suposición.</p>
              <div className="config-form compact"><label>Origen<select value={mergeSource} onChange={(e) => { setMergeSource(e.target.value); setMergeTarget(""); }}><option value="">Seleccionar</option>{mergeSources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Destino<select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} disabled={!mergeSource}><option value="">Seleccionar</option>{mergeTargets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button type="button" className="secondary-button danger-aware" disabled={!mergeSource || !mergeTarget || busy} onClick={() => void run(async () => { await requestConfiguration("category.merge", { sourceCategoryId: mergeSource, targetCategoryId: mergeTarget }); setMergeSource(""); setMergeTarget(""); }, "Categorías fusionadas correctamente.")}><Icon name="merge" />Fusionar</button></div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}