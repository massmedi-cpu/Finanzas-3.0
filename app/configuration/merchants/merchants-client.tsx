"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./merchants.module.css";

type Category = {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  lifecycle: "active" | "archived";
};

type Merchant = {
  id: string;
  name: string;
  normalized_name: string;
  default_category_id: string | null;
  lifecycle: "active" | "archived";
  default_category_name: string | null;
  default_category_kind: string | null;
  default_category_lifecycle: string | null;
  alias_count: number;
};

type MerchantAlias = {
  id: string;
  merchant_id: string;
  alias: string;
  normalized_alias: string;
};

type MerchantPayload = { merchants: Merchant[]; aliases: MerchantAlias[] };

type MerchantForm = {
  name: string;
  defaultCategoryId: string;
};

const EMPTY_FORM: MerchantForm = { name: "", defaultCategoryId: "" };

const ERROR_MESSAGES: Record<string, string> = {
  merchant_name_required: "El nombre del comercio es obligatorio.",
  merchant_name_not_resolvable: "El nombre del comercio no contiene información identificable.",
  merchant_name_conflicts_with_alias: "Ese nombre ya existe como alias de otro comercio.",
  merchant_alias_required: "El alias es obligatorio.",
  merchant_alias_not_resolvable: "El alias no contiene información identificable.",
  merchant_alias_conflicts_with_canonical_name: "Ese alias coincide con el nombre canónico de un comercio.",
  invalid_merchant_default_category: "La categoría predeterminada ya no está activa.",
  merchant_not_found: "El comercio ya no existe.",
  merchant_alias_not_found: "El alias ya no existe.",
};

function errorMessage(payload: any) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  return ERROR_MESSAGES[code] ?? "No se pudo completar la operación.";
}

async function merchantRequest(operation: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/merchants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data));
  return data;
}

function kindLabel(kind: string | null) {
  if (kind === "expense") return "Gasto";
  if (kind === "income") return "Ingreso";
  if (kind === "transfer") return "Transferencia";
  return "Sin categoría";
}

export default function MerchantsClient() {
  const [data, setData] = useState<MerchantPayload>({ merchants: [], aliases: [] });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [merchantForm, setMerchantForm] = useState<MerchantForm>(EMPTY_FORM);
  const [aliasText, setAliasText] = useState("");
  const [resolveText, setResolveText] = useState("");
  const [resolveResult, setResolveResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [merchantResponse, configResponse] = await Promise.all([
        fetch("/api/merchants", { cache: "no-store" }),
        fetch("/api/configuration", { cache: "no-store" }),
      ]);
      if (!merchantResponse.ok || !configResponse.ok) throw new Error("No se pudo leer la configuración persistente.");
      const merchantPayload = (await merchantResponse.json()) as MerchantPayload;
      const configPayload = (await configResponse.json()) as { categories?: Category[] };
      setData(merchantPayload);
      setCategories(Array.isArray(configPayload.categories) ? configPayload.categories : []);
      setSelectedMerchantId((current) => {
        if (current && merchantPayload.merchants.some((merchant) => merchant.id === current)) return current;
        return merchantPayload.merchants.find((merchant) => merchant.lifecycle === "active")?.id ?? merchantPayload.merchants[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar Comercios y alias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedMerchant = useMemo(
    () => data.merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [data.merchants, selectedMerchantId],
  );
  const selectedAliases = useMemo(
    () => data.aliases.filter((alias) => alias.merchant_id === selectedMerchantId),
    [data.aliases, selectedMerchantId],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => category.lifecycle === "active"),
    [categories],
  );
  const filteredMerchants = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-ES");
    if (!term) return data.merchants;
    return data.merchants.filter((merchant) => {
      const aliasText = data.aliases.filter((alias) => alias.merchant_id === merchant.id).map((alias) => alias.alias).join(" ");
      return `${merchant.name} ${merchant.normalized_name} ${aliasText}`.toLocaleLowerCase("es-ES").includes(term);
    });
  }, [data.merchants, data.aliases, search]);

  const activeMerchantCount = data.merchants.filter((merchant) => merchant.lifecycle === "active").length;

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  }

  function beginNewMerchant() {
    setEditingMerchantId(null);
    setMerchantForm(EMPTY_FORM);
    setNotice(null);
    document.getElementById("merchant-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function beginEditMerchant(merchant: Merchant) {
    setEditingMerchantId(merchant.id);
    setSelectedMerchantId(merchant.id);
    setMerchantForm({ name: merchant.name, defaultCategoryId: merchant.default_category_id ?? "" });
    setNotice(null);
    document.getElementById("merchant-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submitMerchant(event: FormEvent) {
    event.preventDefault();
    const existing = editingMerchantId ? data.merchants.find((merchant) => merchant.id === editingMerchantId) : null;
    await run(async () => {
      const result = await merchantRequest("merchant.save", {
        id: editingMerchantId,
        name: merchantForm.name,
        defaultCategoryId: merchantForm.defaultCategoryId || null,
        lifecycle: existing?.lifecycle ?? "active",
      });
      const savedId = result?.merchant?.id as string | undefined;
      if (savedId) setSelectedMerchantId(savedId);
      setEditingMerchantId(null);
      setMerchantForm(EMPTY_FORM);
    }, editingMerchantId ? "Comercio actualizado." : "Comercio creado y persistido.");
  }

  async function toggleLifecycle(merchant: Merchant) {
    const next = merchant.lifecycle === "active" ? "archived" : "active";
    await run(
      () => merchantRequest("merchant.save", {
        id: merchant.id,
        name: merchant.name,
        defaultCategoryId: merchant.default_category_id,
        lifecycle: next,
      }).then(() => undefined),
      next === "archived" ? "Comercio archivado." : "Comercio reactivado.",
    );
  }

  async function submitAlias(event: FormEvent) {
    event.preventDefault();
    if (!selectedMerchant) {
      setError("Selecciona un comercio antes de añadir un alias.");
      return;
    }
    await run(async () => {
      await merchantRequest("merchant_alias.save", {
        merchantId: selectedMerchant.id,
        alias: aliasText,
      });
      setAliasText("");
    }, "Alias añadido.");
  }

  async function removeAlias(alias: MerchantAlias) {
    await run(
      () => merchantRequest("merchant_alias.delete", { id: alias.id }).then(() => undefined),
      "Alias eliminado.",
    );
  }

  async function resolveMerchant(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResolveResult(null);
    try {
      const result = await merchantRequest("merchant.resolve", { label: resolveText });
      const merchant = result?.merchant as Merchant | null;
      setResolveResult(merchant ? `Coincide con ${merchant.name}.` : "No existe una equivalencia activa.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo resolver el texto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FASE 3 · NORMALIZACIÓN CENTRAL</p>
          <h1>Comercios y alias</h1>
          <p className={styles.copy}>Define un nombre canónico por comercio, agrupa variantes bancarias mediante alias y asigna una categoría predeterminada sin alterar la fuente bancaria.</p>
        </div>
        <div className={styles.summary} aria-label="Resumen de comercios">
          <div><strong>{activeMerchantCount}</strong><span>Activos</span></div>
          <div><strong>{data.aliases.length}</strong><span>Alias</span></div>
          <button type="button" onClick={() => void load()} disabled={loading || busy} aria-label="Actualizar comercios">Actualizar</button>
        </div>
      </header>

      {error && <div className={`${styles.message} ${styles.error}`} role="alert">{error}</div>}
      {notice && <div className={`${styles.message} ${styles.success}`} role="status">{notice}</div>}

      <section className={styles.toolbar} aria-label="Herramientas de comercios">
        <label>
          <span>Buscar comercio o alias</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Carrefour, TPV, Amazon…" />
        </label>
        <button type="button" onClick={beginNewMerchant} disabled={busy}>+ Nuevo comercio</button>
      </section>

      {loading ? <section className={styles.panel}>Leyendo comercios persistentes…</section> : (
        <div className={styles.layout}>
          <section className={styles.panel} aria-labelledby="merchant-list-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.kicker}>FUENTE DE VERDAD</p>
                <h2 id="merchant-list-heading">Comercios</h2>
              </div>
              <span>{filteredMerchants.length}</span>
            </div>

            <div className={styles.merchantList}>
              {filteredMerchants.length === 0 ? <p className={styles.empty}>No hay comercios que coincidan con la búsqueda.</p> : filteredMerchants.map((merchant) => (
                <article key={merchant.id} className={`${styles.merchantCard} ${selectedMerchantId === merchant.id ? styles.selected : ""}`}>
                  <button className={styles.cardMain} type="button" onClick={() => setSelectedMerchantId(merchant.id)} aria-pressed={selectedMerchantId === merchant.id}>
                    <span className={styles.merchantTitle}>{merchant.name}</span>
                    <span className={styles.meta}>{merchant.alias_count} alias · {merchant.default_category_name ?? "Sin categoría"}</span>
                    <span className={styles.normalized}>Normalizado: {merchant.normalized_name}</span>
                  </button>
                  <div className={styles.cardActions}>
                    <span className={merchant.lifecycle === "active" ? styles.activeBadge : styles.archivedBadge}>{merchant.lifecycle === "active" ? "Activo" : "Archivado"}</span>
                    <button type="button" onClick={() => beginEditMerchant(merchant)} disabled={busy}>Editar</button>
                    <button type="button" onClick={() => void toggleLifecycle(merchant)} disabled={busy}>{merchant.lifecycle === "active" ? "Archivar" : "Reactivar"}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.sideStack}>
            <section className={styles.panel} id="merchant-form" aria-labelledby="merchant-form-heading">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.kicker}>{editingMerchantId ? "EDICIÓN" : "NUEVO"}</p>
                  <h2 id="merchant-form-heading">{editingMerchantId ? "Editar comercio" : "Crear comercio"}</h2>
                </div>
              </div>
              <form className={styles.form} onSubmit={(event) => void submitMerchant(event)}>
                <label><span>Nombre canónico</span><input required value={merchantForm.name} onChange={(event) => setMerchantForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Carrefour" /></label>
                <label><span>Categoría predeterminada</span><select value={merchantForm.defaultCategoryId} onChange={(event) => setMerchantForm((current) => ({ ...current, defaultCategoryId: event.target.value }))}><option value="">Sin categoría predeterminada</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} · {kindLabel(category.kind)}</option>)}</select></label>
                <div className={styles.formActions}>
                  <button className={styles.primary} type="submit" disabled={busy}>{editingMerchantId ? "Guardar cambios" : "Crear comercio"}</button>
                  {editingMerchantId && <button type="button" onClick={beginNewMerchant} disabled={busy}>Cancelar</button>}
                </div>
              </form>
            </section>

            <section className={styles.panel} aria-labelledby="alias-heading">
              <div className={styles.panelHeading}>
                <div><p className={styles.kicker}>EQUIVALENCIAS</p><h2 id="alias-heading">Alias {selectedMerchant ? `· ${selectedMerchant.name}` : ""}</h2></div>
              </div>
              {!selectedMerchant ? <p className={styles.empty}>Selecciona un comercio para gestionar sus alias.</p> : (
                <>
                  <form className={styles.inlineForm} onSubmit={(event) => void submitAlias(event)}>
                    <label><span>Nuevo alias</span><input required value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder="Texto tal como llega del banco" /></label>
                    <button className={styles.primary} type="submit" disabled={busy}>Añadir alias</button>
                  </form>
                  <div className={styles.aliasList}>
                    {selectedAliases.length === 0 ? <p className={styles.empty}>Este comercio todavía no tiene alias.</p> : selectedAliases.map((alias) => (
                      <div className={styles.aliasRow} key={alias.id}>
                        <div><strong>{alias.alias}</strong><span>{alias.normalized_alias}</span></div>
                        <button type="button" onClick={() => void removeAlias(alias)} disabled={busy}>Eliminar</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="resolver-heading">
              <div className={styles.panelHeading}><div><p className={styles.kicker}>COMPROBACIÓN</p><h2 id="resolver-heading">Probar equivalencia</h2></div></div>
              <form className={styles.inlineForm} onSubmit={(event) => void resolveMerchant(event)}>
                <label><span>Texto recibido</span><input required value={resolveText} onChange={(event) => setResolveText(event.target.value)} placeholder="Ej. TPV CARREFOUR 123" /></label>
                <button type="submit" disabled={busy}>Resolver</button>
              </form>
              {resolveResult && <p className={styles.resolveResult} role="status">{resolveResult}</p>}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
