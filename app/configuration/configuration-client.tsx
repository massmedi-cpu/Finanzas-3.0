"use client";

import { type CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Account, AccountType, Category, CategoryKind, EntityId } from "../../src/domain/models";
import { validateCategoryHierarchy, validateCategoryMerge } from "../../src/domain/configuration-policies";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  categoryColorHex,
} from "../../src/domain/category-visuals";
import { CategoryGlyph } from "../../src/ui/category-glyph";
import { formatMoneyCents, parseSpanishMoneyToCents } from "../../src/core/money";

type ConfigPayload = { accounts: Account[]; categories: Category[] };
type Tab = "accounts" | "categories";
type CategoryFilter = "all" | CategoryKind;
type CategoryImpact = {
  transactionCount: number;
  overrideCount: number;
  ruleConditionCount: number;
  ruleTargetCount: number;
  merchantCount: number;
  budgetCount: number;
  activeRecurrenceCount: number;
  futureForecastCount: number;
  activeChildCount: number;
};

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

const INITIAL_ACCOUNT: AccountForm = { name: "", institution: "", type: "checking", openingBalance: "0,00" };
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
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
  { value: "transfer", label: "Transferencias" },
];
const EMPTY_IMPACT: CategoryImpact = {
  transactionCount: 0,
  overrideCount: 0,
  ruleConditionCount: 0,
  ruleTargetCount: 0,
  merchantCount: 0,
  budgetCount: 0,
  activeRecurrenceCount: 0,
  futureForecastCount: 0,
  activeChildCount: 0,
};

function labelForAccountType(type: AccountType) {
  return ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? type;
}
function labelForCategoryKind(kind: CategoryKind) {
  return CATEGORY_KINDS.find((item) => item.value === kind)?.label ?? kind;
}
function sameAccountGroup(left: Account, right: Account) {
  return left.lifecycle === right.lifecycle;
}
function sameCategoryGroup(left: Category, right: Category) {
  return left.kind === right.kind && left.parentCategoryId === right.parentCategoryId;
}
function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES").trim();
}
function categoryStyle(category: Category): CSSProperties {
  return { "--category-color": categoryColorHex(category.colorToken) } as CSSProperties;
}
function impactTotal(impact: CategoryImpact) {
  return impact.transactionCount + impact.overrideCount + impact.ruleConditionCount + impact.ruleTargetCount +
    impact.merchantCount + impact.budgetCount + impact.activeRecurrenceCount + impact.futureForecastCount + impact.activeChildCount;
}
function archiveBlocked(impact: CategoryImpact) {
  return impact.ruleConditionCount > 0 || impact.ruleTargetCount > 0 || impact.merchantCount > 0 ||
    impact.activeRecurrenceCount > 0 || impact.futureForecastCount > 0 || impact.activeChildCount > 0;
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
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
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
      : data?.message || data?.code || data?.error || "No se pudo completar la operación.";
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
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeImpact, setMergeImpact] = useState<CategoryImpact | null>(null);
  const [mergeReviewed, setMergeReviewed] = useState(false);
  const [archiveCandidateId, setArchiveCandidateId] = useState<EntityId | null>(null);
  const [archiveImpact, setArchiveImpact] = useState<CategoryImpact | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/configuration", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar la configuración.");
      setData((await response.json()) as ConfigPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAccounts = useMemo(() => data.accounts.filter((item) => item.lifecycle === "active").length, [data.accounts]);
  const activeCategories = useMemo(() => data.categories.filter((item) => item.lifecycle === "active").length, [data.categories]);
  const editingCategory = editingCategoryId ? data.categories.find((item) => item.id === editingCategoryId) ?? null : null;
  const categoryById = useMemo(() => new Map(data.categories.map((item) => [item.id, item])), [data.categories]);

  const parentOptions = useMemo(() => data.categories.filter((item) => {
    if (item.lifecycle !== "active" || item.kind !== categoryForm.kind || item.id === editingCategoryId || item.parentCategoryId) return false;
    const candidate = editingCategory
      ? { ...editingCategory, kind: categoryForm.kind, parentCategoryId: item.id }
      : { id: "__new-category__", kind: categoryForm.kind, parentCategoryId: item.id };
    return validateCategoryHierarchy(candidate, data.categories).length === 0;
  }), [data.categories, categoryForm.kind, editingCategoryId, editingCategory]);

  const mergeSources = useMemo(() => data.categories.filter((item) => item.lifecycle === "active"), [data.categories]);
  const selectedSource = data.categories.find((item) => item.id === mergeSource);
  const mergeTargets = useMemo(() => selectedSource
    ? data.categories.filter((item) => item.lifecycle === "active" && validateCategoryMerge(selectedSource, item, data.categories).length === 0)
    : [], [data.categories, selectedSource]);

  const visibleCategoryIds = useMemo(() => {
    const query = normalizeSearch(categorySearch);
    const visible = new Set<EntityId>();
    for (const category of data.categories) {
      if (!showArchived && category.lifecycle === "archived") continue;
      if (categoryFilter !== "all" && category.kind !== categoryFilter) continue;
      const parent = category.parentCategoryId ? categoryById.get(category.parentCategoryId) : null;
      const haystack = normalizeSearch(`${category.name} ${parent?.name ?? ""} ${labelForCategoryKind(category.kind)}`);
      if (!query || haystack.includes(query)) {
        visible.add(category.id);
        if (category.parentCategoryId) visible.add(category.parentCategoryId);
      }
    }
    return visible;
  }, [data.categories, categorySearch, categoryFilter, showArchived, categoryById]);

  const categoryGroups = useMemo(() => CATEGORY_KINDS.map((kind) => {
    const roots = data.categories
      .filter((category) => category.kind === kind.value && !category.parentCategoryId && visibleCategoryIds.has(category.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
    return { ...kind, roots };
  }).filter((group) => group.roots.length > 0), [data.categories, visibleCategoryIds]);

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

  function canMoveAccount(index: number, delta: number) {
    const current = data.accounts[index];
    const next = data.accounts[index + delta];
    return Boolean(current && next && sameAccountGroup(current, next));
  }

  function canMoveCategory(category: Category, delta: number) {
    const siblings = data.categories
      .filter((item) => sameCategoryGroup(item, category))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
    const index = siblings.findIndex((item) => item.id === category.id);
    return index >= 0 && Boolean(siblings[index + delta]);
  }

  function canUseCategoryKind(kind: CategoryKind) {
    if (!editingCategory) return true;
    return validateCategoryHierarchy({ ...editingCategory, kind, parentCategoryId: null }, data.categories).length === 0;
  }

  function hasActiveCategoryChildren(categoryId: EntityId) {
    return data.categories.some((item) => item.parentCategoryId === categoryId && item.lifecycle === "active");
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

  async function getImpact(id: EntityId) {
    const result = await requestConfiguration("category.impact", { id });
    return (result?.impact ?? EMPTY_IMPACT) as CategoryImpact;
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    let openingBalanceCents: number;
    try { openingBalanceCents = parseSpanishMoneyToCents(accountForm.openingBalance); }
    catch {
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
    }, editingAccountId ? "Cuenta actualizada." : "Cuenta creada.");
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
    }, editingCategoryId ? "Categoría actualizada." : "Categoría creada.");
  }

  async function reorderAccounts(index: number, delta: number) {
    const nextIndex = index + delta;
    if (!canMoveAccount(index, delta)) return;
    const ordered = data.accounts.map((item) => item.id);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    await run(() => requestConfiguration("account.reorder", { orderedIds: ordered }).then(() => undefined), "Orden de cuentas actualizado.");
  }

  async function reorderCategories(category: Category, delta: number) {
    const siblings = data.categories
      .filter((item) => sameCategoryGroup(item, category))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
    const siblingIndex = siblings.findIndex((item) => item.id === category.id);
    const nextSibling = siblings[siblingIndex + delta];
    if (!nextSibling) return;
    const currentIndex = data.categories.findIndex((item) => item.id === category.id);
    const nextIndex = data.categories.findIndex((item) => item.id === nextSibling.id);
    const ordered = data.categories.map((item) => item.id);
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    await run(() => requestConfiguration("category.reorder", { orderedIds: ordered }).then(() => undefined), "Orden de categorías actualizado.");
  }

  async function prepareArchive(category: Category) {
    if (category.lifecycle === "archived") {
      await run(() => requestConfiguration("category.archive", { id: category.id, archived: false }).then(() => undefined), "Categoría reactivada.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const impact = await getImpact(category.id);
      setArchiveCandidateId(category.id);
      setArchiveImpact(impact);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo comprobar el impacto del archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function selectMergeSource(id: string) {
    setMergeSource(id);
    setMergeTarget("");
    setMergeReviewed(false);
    setMergeImpact(null);
    if (!id) return;
    setBusy(true);
    try { setMergeImpact(await getImpact(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo comprobar el impacto de la fusión."); }
    finally { setBusy(false); }
  }

  function renderCategory(category: Category, depth = 0) {
    const parent = category.parentCategoryId ? categoryById.get(category.parentCategoryId) : null;
    return (
      <article
        className={`entity-card category-card ${depth ? "category-child" : ""} ${category.lifecycle === "archived" ? "archived" : ""}`}
        key={category.id}
        style={categoryStyle(category)}
      >
        <div className="entity-main">
          <div className="entity-icon category-swatch"><CategoryGlyph name={category.iconKey} /></div>
          <div>
            <div className="entity-title-row">
              <h3>{category.name}</h3>
              <span className={`lifecycle ${category.lifecycle}`}>{category.lifecycle === "active" ? "Activa" : "Archivada"}</span>
            </div>
            <p>{depth ? `Subcategoría de ${parent?.name ?? "categoría"}` : labelForCategoryKind(category.kind)}</p>
          </div>
        </div>
        <div className="entity-actions">
          <button type="button" className="icon-button" onClick={() => beginCategoryEdit(category)} aria-label={`Editar ${category.name}`}><Icon name="edit" /></button>
          <button type="button" className="icon-button" disabled={busy || !canMoveCategory(category, -1)} onClick={() => void reorderCategories(category, -1)} aria-label={`Subir ${category.name}`}><Icon name="up" /></button>
          <button type="button" className="icon-button" disabled={busy || !canMoveCategory(category, 1)} onClick={() => void reorderCategories(category, 1)} aria-label={`Bajar ${category.name}`}><Icon name="down" /></button>
          <button type="button" className="icon-button" disabled={busy || (category.lifecycle === "active" && hasActiveCategoryChildren(category.id))} onClick={() => void prepareArchive(category)} aria-label={category.lifecycle === "active" ? `Archivar ${category.name}` : `Reactivar ${category.name}`}><Icon name="archive" /></button>
        </div>
      </article>
    );
  }

  const archiveCandidate = archiveCandidateId ? data.categories.find((item) => item.id === archiveCandidateId) ?? null : null;
  const selectedIconLabel = CATEGORY_ICON_OPTIONS.find((item) => item.value === categoryForm.iconKey)?.label ?? categoryForm.iconKey;
  const selectedColorLabel = CATEGORY_COLOR_OPTIONS.find((item) => item.value === categoryForm.colorToken)?.label ?? categoryForm.colorToken;

  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <a className="back-link" href="/">← Inicio</a>
          <p className="eyebrow">FINANCIAL APP · CONFIGURACIÓN</p>
          <h1>Cuentas y categorías</h1>
        </div>
        <div className="configuration-summary" aria-label="Resumen de configuración">
          <div><strong>{activeAccounts}</strong><span>Cuentas activas</span></div>
          <div><strong>{activeCategories}</strong><span>Categorías activas</span></div>
          <button className="icon-button" type="button" onClick={() => void load()} disabled={loading || busy} aria-label="Actualizar datos"><Icon name="refresh" /></button>
        </div>
      </header>

      <nav className="config-tabs" aria-label="Secciones de configuración">
        <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}><Icon name="account" />Cuentas <span>{data.accounts.length}</span></button>
        <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}><CategoryGlyph name="wallet" />Categorías <span>{activeCategories}</span></button>
      </nav>

      {error && <div className="config-message error" role="alert">{error}</div>}
      {notice && <div className="config-message success" role="status">{notice}</div>}

      {tab === "categories" && archiveCandidate && archiveImpact && (
        <section className="category-confirmation" role="alertdialog" aria-labelledby="archive-title" aria-describedby="archive-detail">
          <div>
            <h2 id="archive-title">Archivar «{archiveCandidate.name}»</h2>
            <p id="archive-detail">
              {archiveBlocked(archiveImpact)
                ? "Esta categoría aún tiene dependencias activas y no puede archivarse de forma segura."
                : `${archiveImpact.transactionCount} movimientos históricos conservarán la categoría archivada.`}
            </p>
          </div>
          <div className="impact-grid" aria-label="Impacto de la categoría">
            <span><strong>{archiveImpact.transactionCount}</strong> movimientos</span>
            <span><strong>{archiveImpact.ruleConditionCount + archiveImpact.ruleTargetCount}</strong> reglas activas</span>
            <span><strong>{archiveImpact.merchantCount}</strong> comercios</span>
            <span><strong>{archiveImpact.activeRecurrenceCount}</strong> recurrentes</span>
            <span><strong>{archiveImpact.futureForecastCount}</strong> previsiones</span>
          </div>
          <div className="form-actions">
            {!archiveBlocked(archiveImpact) && (
              <button className="secondary-button danger-aware" disabled={busy} type="button" onClick={() => void run(async () => {
                await requestConfiguration("category.archive", { id: archiveCandidate.id, archived: true });
                setArchiveCandidateId(null);
                setArchiveImpact(null);
              }, "Categoría archivada.")}>Confirmar archivo</button>
            )}
            <button className="secondary-button" type="button" onClick={() => { setArchiveCandidateId(null); setArchiveImpact(null); }}>Cancelar</button>
          </div>
        </section>
      )}

      {loading ? <section className="config-panel loading-state">Cargando configuración…</section> : tab === "accounts" ? (
        <div className="config-layout">
          <section className="config-panel list-panel" aria-labelledby="accounts-heading">
            <div className="panel-heading"><h2 id="accounts-heading">Cuentas</h2><span className="status-chip">Datos guardados</span></div>
            {data.accounts.length === 0 ? <div className="empty-state"><Icon name="account" /><h3>Aún no hay cuentas</h3></div> : (
              <div className="entity-list">
                {data.accounts.map((account, index) => <article className={`entity-card ${account.lifecycle === "archived" ? "archived" : ""}`} key={account.id}>
                  <div className="entity-main"><div className="entity-icon"><Icon name="account" /></div><div><div className="entity-title-row"><h3>{account.name}</h3><span className={`lifecycle ${account.lifecycle}`}>{account.lifecycle === "active" ? "Activa" : "Archivada"}</span></div><p>{account.institution || "Sin entidad"} · {labelForAccountType(account.type)}</p><strong>{formatMoneyCents(account.openingBalanceCents)}</strong></div></div>
                  <div className="entity-actions">
                    <button type="button" className="icon-button" onClick={() => beginAccountEdit(account)} aria-label={`Editar ${account.name}`}><Icon name="edit" /></button>
                    <button type="button" className="icon-button" disabled={busy || !canMoveAccount(index, -1)} onClick={() => void reorderAccounts(index, -1)} aria-label="Subir dentro de su grupo"><Icon name="up" /></button>
                    <button type="button" className="icon-button" disabled={busy || !canMoveAccount(index, 1)} onClick={() => void reorderAccounts(index, 1)} aria-label="Bajar dentro de su grupo"><Icon name="down" /></button>
                    <button type="button" className="icon-button" disabled={busy} onClick={() => void run(() => requestConfiguration("account.archive", { id: account.id, archived: account.lifecycle === "active" }).then(() => undefined), account.lifecycle === "active" ? "Cuenta archivada." : "Cuenta reactivada.")} aria-label={account.lifecycle === "active" ? "Archivar" : "Reactivar"}><Icon name="archive" /></button>
                  </div>
                </article>)}
              </div>
            )}
          </section>

          <aside className="config-panel form-panel" id="account-form">
            <div className="panel-heading"><h2>{editingAccountId ? "Editar cuenta" : "Añadir cuenta"}</h2></div>
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
        <div className="config-layout categories-layout">
          <section className="config-panel list-panel" aria-labelledby="categories-heading">
            <div className="panel-heading"><h2 id="categories-heading">Categorías</h2><span className="status-chip">{activeCategories} activas</span></div>

            <div className="category-toolbar">
              <label className="category-search"><Icon name="search" /><span className="sr-only">Buscar categoría</span><input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Buscar categoría…" /></label>
              <div className="category-filter" role="group" aria-label="Filtrar categorías por tipo">
                <button type="button" className={categoryFilter === "all" ? "active" : ""} onClick={() => setCategoryFilter("all")}>Todas</button>
                {CATEGORY_KINDS.map((item) => <button type="button" key={item.value} className={categoryFilter === item.value ? "active" : ""} onClick={() => setCategoryFilter(item.value)}>{item.label}</button>)}
              </div>
              <label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Ver archivadas</label>
            </div>

            {categoryGroups.length === 0 ? <div className="empty-state"><CategoryGlyph name="wallet" size={28} /><h3>No hay categorías que coincidan</h3></div> : (
              <div className="category-groups">
                {categoryGroups.map((group) => (
                  <section className="category-group" key={group.value} aria-labelledby={`category-group-${group.value}`}>
                    <div className="category-group-heading"><h3 id={`category-group-${group.value}`}>{group.label}</h3><span>{group.roots.reduce((count, root) => count + 1 + data.categories.filter((item) => item.parentCategoryId === root.id && visibleCategoryIds.has(item.id)).length, 0)}</span></div>
                    <div className="entity-list">
                      {group.roots.flatMap((root) => {
                        const children = data.categories
                          .filter((item) => item.parentCategoryId === root.id && visibleCategoryIds.has(item.id))
                          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
                        return [renderCategory(root), ...children.map((child) => renderCategory(child, 1))];
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <aside className="configuration-side-stack">
            <section className="config-panel form-panel" id="category-form">
              <div className="panel-heading"><h2>{editingCategoryId ? "Editar categoría" : "Añadir categoría"}</h2></div>
              <form className="config-form" onSubmit={submitCategory}>
                <label>Nombre<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Ej. Supermercado" /></label>
                <label>Tipo<select value={categoryForm.kind} onChange={(e) => setCategoryForm({ ...categoryForm, kind: e.target.value as CategoryKind, parentCategoryId: "" })}>{CATEGORY_KINDS.map((item) => <option value={item.value} key={item.value} disabled={!canUseCategoryKind(item.value)}>{item.label}</option>)}</select></label>
                <label>Categoría superior<select value={categoryForm.parentCategoryId} onChange={(e) => setCategoryForm({ ...categoryForm, parentCategoryId: e.target.value })}><option value="">Sin categoría superior</option>{parentOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>

                <div className="category-visual-preview" style={{ "--category-color": categoryColorHex(categoryForm.colorToken) } as CSSProperties}>
                  <div className="entity-icon category-swatch"><CategoryGlyph name={categoryForm.iconKey} size={20} /></div>
                  <div><strong>{selectedIconLabel}</strong><span>{selectedColorLabel}</span></div>
                </div>

                <div className="form-row">
                  <label>Icono<select value={categoryForm.iconKey} onChange={(e) => setCategoryForm({ ...categoryForm, iconKey: e.target.value })}>{CATEGORY_ICON_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                  <label>Color<select value={categoryForm.colorToken} onChange={(e) => setCategoryForm({ ...categoryForm, colorToken: e.target.value })}>{CATEGORY_COLOR_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                </div>
                <div className="color-palette" role="group" aria-label="Paleta de colores">
                  {CATEGORY_COLOR_OPTIONS.map((item) => <button key={item.value} type="button" className={categoryForm.colorToken === item.value ? "selected" : ""} style={{ "--swatch": item.hex } as CSSProperties} onClick={() => setCategoryForm({ ...categoryForm, colorToken: item.value })} aria-label={`Color ${item.label}`} aria-pressed={categoryForm.colorToken === item.value} />)}
                </div>
                <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}><Icon name="plus" />{editingCategoryId ? "Guardar cambios" : "Crear categoría"}</button>{editingCategoryId && <button className="secondary-button" type="button" onClick={() => { setEditingCategoryId(null); setCategoryForm(INITIAL_CATEGORY); }}>Cancelar</button>}</div>
              </form>
            </section>

            <section className="config-panel merge-panel">
              <div className="panel-heading"><h2>Fusionar categorías</h2><Icon name="merge" /></div>
              <div className="config-form compact">
                <label>Origen<select value={mergeSource} onChange={(e) => void selectMergeSource(e.target.value)}><option value="">Seleccionar</option>{mergeSources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>Destino<select value={mergeTarget} onChange={(e) => { setMergeTarget(e.target.value); setMergeReviewed(false); }} disabled={!mergeSource}><option value="">Seleccionar</option>{mergeTargets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>

                {mergeImpact && mergeSource && (
                  <div className="merge-impact" aria-live="polite">
                    <strong>{impactTotal(mergeImpact)} referencias relacionadas</strong>
                    <div className="impact-grid compact-impact">
                      <span><b>{mergeImpact.transactionCount}</b> movimientos</span>
                      <span><b>{mergeImpact.ruleConditionCount + mergeImpact.ruleTargetCount}</b> reglas</span>
                      <span><b>{mergeImpact.merchantCount}</b> comercios</span>
                      <span><b>{mergeImpact.budgetCount}</b> presupuestos</span>
                      <span><b>{mergeImpact.activeRecurrenceCount}</b> recurrentes</span>
                      <span><b>{mergeImpact.futureForecastCount}</b> previsiones</span>
                    </div>
                  </div>
                )}

                <button type="button" className={`secondary-button ${mergeReviewed ? "danger-aware" : ""}`} disabled={!mergeSource || !mergeTarget || busy} onClick={() => {
                  if (!mergeReviewed) {
                    setMergeReviewed(true);
                    return;
                  }
                  void run(async () => {
                    await requestConfiguration("category.merge", { sourceCategoryId: mergeSource, targetCategoryId: mergeTarget });
                    setMergeSource("");
                    setMergeTarget("");
                    setMergeImpact(null);
                    setMergeReviewed(false);
                  }, "Categorías fusionadas correctamente.");
                }}><Icon name="merge" />{mergeReviewed ? "Confirmar fusión" : "Revisar fusión"}</button>
                {mergeReviewed && <p className="merge-confirmation-note" role="status">La categoría origen se archivará y todas sus referencias compatibles pasarán al destino.</p>}
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
