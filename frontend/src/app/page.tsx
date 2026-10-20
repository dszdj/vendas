"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type User = { id: string; email: string };
type ProductImage = { id: string; mimeType: string; isPrimary: boolean };
type Product = {
  id: string;
  name: string;
  category: string;
  size: string;
  color: string;
  cost: number | string;
  price: number | string;
  stock: number;
  minimum: number;
  images: ProductImage[];
};
type ImageDraft = { key: string; id?: string; file?: File; url: string };
type ProductSummary = {
  products: number;
  stockUnits: number;
  lowStock: number;
  categories: number;
};
type ProductForm = {
  name: string;
  category: string;
  size: string;
  color: string;
  cost: string;
  price: string;
  stock: string;
  minimum: string;
};

const emptyForm: ProductForm = {
  name: "",
  category: "",
  size: "M",
  color: "",
  cost: "",
  price: "",
  stock: "0",
  minimum: "5",
};
const productCategories = ["Camiseta", "Bermuda", "Calça", "Meia", "Boné", "Acessórios"];
const maxProductImages = 6;
const maxInputImageBytes = 50 * 1024 * 1024;
const maxImageBytes = 4 * 1024 * 1024;
const maxImageDimension = 2560;

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    let message = "Não foi possível concluir a solicitação.";
    if (payload && typeof payload === "object" && "message" in payload) {
      const detail = payload.message;
      message = Array.isArray(detail) ? detail.join(" ") : String(detail);
    }
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function money(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function productImageUrl(productId: string, imageId: string): string {
  return `${API_URL}/api/products/${productId}/images/${imageId}`;
}

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, maxImageDimension / Math.max(bitmap.width, bitmap.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.84, 0.72, 0.6, 0.48, 0.36]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => result ? resolve(result) : reject(new Error("Não foi possível converter a imagem.")),
            "image/webp",
            quality,
          );
        });
        if (blob.size <= maxImageBytes && blob.type === "image/webp") {
          const baseName = file.name.replace(/\.[^.]+$/, "") || "produto";
          return new File([blob], `${baseName}.webp`, { type: blob.type, lastModified: file.lastModified });
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Não foi possível reduzir esta imagem para menos de 4 MB. Tente uma imagem menor.");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return "API indisponível. Inicie o sistema com npm run dev para entrar.";
  }
  return error instanceof Error ? error.message : fallback;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<ProductSummary>({
    products: 0,
    stockUnits: 0,
    lowStock: 0,
    categories: 0,
  });
  const [search, setSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageDrafts, setImageDrafts] = useState<ImageDraft[]>([]);
  const [primaryImageKey, setPrimaryImageKey] = useState("");
  const [preparingImages, setPreparingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const loadProducts = useCallback(async (query: string, signal?: AbortSignal) => {
    const suffix = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
    return api<Product[]>(`/products${suffix}`, { signal });
  }, []);

  const loadSummary = useCallback(async () => {
    const result = await api<ProductSummary>("/products/summary");
    setSummary(result);
  }, []);

  useEffect(() => {
    let active = true;
    api<User>("/auth/me")
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch((error: unknown) => {
        if (active && (!(error instanceof ApiError) || error.status !== 401)) {
          setNotice({ text: errorMessage(error, "Falha ao conectar à API."), error: true });
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingProducts(true);
      loadProducts(search, controller.signal)
        .then(setProducts)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setNotice({ text: errorMessage(error, "Não foi possível carregar os produtos."), error: true });
            if (error instanceof ApiError && error.status === 401) setUser(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingProducts(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadProducts, search, user]);

  useEffect(() => {
    if (!user) return;
    loadSummary().catch((error: unknown) => {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível carregar o resumo.", error: true });
    });
  }, [loadSummary, user]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    try {
      const result = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember: rememberDevice }),
      });
      setUser(result.user);
      setPassword("");
      setNotice({ text: `Bem-vindo ao Aura Studio, ${result.user.email}.`, error: false });
    } catch (error) {
      setNotice({ text: errorMessage(error, "Falha ao entrar."), error: true });
    }
  }

  async function handleLogout() {
    try {
      await api<{ success: true }>("/auth/logout", { method: "POST" });
    } catch (error) {
      setNotice({ text: errorMessage(error, "Não foi possível encerrar a sessão."), error: true });
      return;
    }
    setUser(null);
    setProducts([]);
    setPassword("");
    setNotice({ text: "Sessão encerrada.", error: false });
  }

  function openNewProduct() {
    clearImageDrafts();
    setEditingProduct(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditProduct(product: Product) {
    clearImageDrafts();
    setEditingProduct(product);
    const drafts = product.images.map((image) => ({
      key: image.id,
      id: image.id,
      url: productImageUrl(product.id, image.id),
    }));
    setImageDrafts(drafts);
    setPrimaryImageKey(product.images.find((image) => image.isPrimary)?.id ?? "");
    setForm({
      name: product.name,
      category: product.category,
      size: product.size,
      color: product.color,
      cost: String(product.cost),
      price: String(product.price),
      stock: String(product.stock),
      minimum: String(product.minimum),
    });
    setModalOpen(true);
  }

  function clearImageDrafts() {
    imageDrafts.forEach((image) => {
      if (image.file) URL.revokeObjectURL(image.url);
    });
    setImageDrafts([]);
    setPrimaryImageKey("");
  }

  function closeProductModal() {
    if (preparingImages || saving) return;
    clearImageDrafts();
    setModalOpen(false);
  }

  async function addImageFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (imageDrafts.length + selected.length > maxProductImages) {
      setNotice({ text: `Cada produto pode ter no máximo ${maxProductImages} imagens.`, error: true });
      return;
    }
    const invalidFile = selected.find((file) => (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > maxInputImageBytes
    ));
    if (invalidFile) {
      setNotice({ text: "Use imagens JPEG, PNG ou WebP de até 50 MB cada.", error: true });
      return;
    }
    setPreparingImages(true);
    setNotice({ text: "Convertendo e reduzindo as imagens antes do envio...", error: false });
    try {
      const compressedFiles: File[] = [];
      for (const file of selected) {
        compressedFiles.push(await compressImage(file));
      }
      const additions = compressedFiles.map((file) => {
        const url = URL.createObjectURL(file);
        return { key: url, url, file };
      });
      setImageDrafts((current) => [...current, ...additions]);
      setPrimaryImageKey((current) => current || additions[0].key);
      setNotice({ text: "Imagens preparadas para envio.", error: false });
    } catch (error) {
      setNotice({ text: errorMessage(error, "Não foi possível preparar as imagens."), error: true });
    } finally {
      setPreparingImages(false);
    }
  }

  function removeImageDraft(image: ImageDraft) {
    if (image.file) URL.revokeObjectURL(image.url);
    const remaining = imageDrafts.filter((item) => item.key !== image.key);
    setImageDrafts(remaining);
    if (primaryImageKey === image.key) setPrimaryImageKey(remaining[0]?.key ?? "");
  }

  async function refreshInventory() {
    const [list, totals] = await Promise.all([loadProducts(search), api<ProductSummary>("/products/summary")]);
    setProducts(list);
    setSummary(totals);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const body = {
      ...form,
      cost: Number(form.cost),
      price: Number(form.price),
      stock: Number(form.stock),
      minimum: Number(form.minimum),
    };
    let savedProduct: Product | null = null;
    try {
      savedProduct = await api<Product>(editingProduct ? `/products/${editingProduct.id}` : "/products", {
        method: editingProduct ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setEditingProduct(savedProduct);

      const keptImages = imageDrafts.filter((image) => image.id);
      const newImages = imageDrafts.filter((image) => image.file);
      const newPrimaryIndex = newImages.findIndex((image) => image.key === primaryImageKey);
      const selectedExistingImage = keptImages.find((image) => image.key === primaryImageKey);
      const formData = new FormData();
      formData.set("keepImageIds", JSON.stringify(keptImages.map((image) => image.id)));
      formData.set("primaryImage", newPrimaryIndex >= 0
        ? `new:${newPrimaryIndex}`
        : selectedExistingImage ? `existing:${selectedExistingImage.id}` : "");
      newImages.forEach((image) => formData.append("images", image.file as File));
      const syncedImages = await api<ProductImage[]>(`/products/${savedProduct.id}/images`, {
        method: "PUT",
        body: formData,
      });
      const newImageDrafts = imageDrafts.map((image) => {
        if (!image.file) return image;
        const uploadedImage = syncedImages[newImages.indexOf(image)];
        if (!uploadedImage) return image;
        URL.revokeObjectURL(image.url);
        return {
          key: uploadedImage.id,
          id: uploadedImage.id,
          url: productImageUrl(savedProduct!.id, uploadedImage.id),
        };
      });
      setImageDrafts(newImageDrafts);
      const primaryKey = newPrimaryIndex >= 0
        ? syncedImages.find((image) => image.isPrimary)?.id ?? ""
        : primaryImageKey;
      savedProduct = { ...savedProduct, images: syncedImages };
      setEditingProduct(savedProduct);
      setPrimaryImageKey(primaryKey);
      await refreshInventory();
      closeProductModal();
      setNotice({ text: editingProduct ? "Produto atualizado." : "Produto cadastrado.", error: false });
    } catch (error) {
      if (savedProduct) {
        setEditingProduct(savedProduct);
        setProducts((current) => {
          const exists = current.some((product) => product.id === savedProduct!.id);
          return exists
            ? current.map((product) => product.id === savedProduct!.id ? savedProduct! : product)
            : current;
        });
      }
      setNotice({ text: errorMessage(error, "Não foi possível salvar o produto."), error: true });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Deseja excluir "${product.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api<{ success: true }>(`/products/${product.id}`, { method: "DELETE" });
      await refreshInventory();
      setNotice({ text: "Produto excluído.", error: false });
    } catch (error) {
      setNotice({ text: errorMessage(error, "Não foi possível excluir o produto."), error: true });
    }
  }

  if (checkingSession) {
    return <main className="screen-center"><p className="muted">Conectando ao Aura Studio...</p></main>;
  }

  if (!user) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">A</div>
          <p className="eyebrow">AURA STUDIO</p>
          <h1>Bem-vindo de volta</h1>
          <p className="muted login-description">Entre para gerenciar seus produtos e estoque.</p>
          {notice && <div className={`notice ${notice.error ? "notice-error" : ""}`} role="status">{notice.text}</div>}
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="login-password">Senha</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <label className="remember-option">
              <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
              Manter sessão neste navegador
            </label>
            <button className="button button-dark button-wide" type="submit">Acessar sistema</button>
          </form>
          <p className="login-help">O acesso inicial é configurado pelo administrador no ambiente do servidor.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="small-brand-mark">A</div>
          <div><strong>Aura Studio</strong><span>Gestão de estoque</span></div>
        </div>
        <div className="sidebar-section-label">MENU PRINCIPAL</div>
        <a className="sidebar-link active" href="/" aria-current="page" title="Produtos e estoque"><span className="nav-icon">▤</span> Produtos &amp; estoque</a>
        <a className="sidebar-link" href="/imagens-ia" title="Imagens com IA"><span className="nav-icon">✳</span> Imagens com IA</a>
        <div className="sidebar-footer">
          <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <div className="user-details"><strong>{user.email}</strong><span>Administrador</span></div>
          <button className="icon-button" type="button" onClick={handleLogout} title="Sair" aria-label="Sair">↪</button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">PAINEL DE CONTROLE</p><h1>Produtos e estoque</h1></div>
          <button className="button button-dark" type="button" onClick={openNewProduct}>＋ <span>Novo produto</span></button>
        </header>
        <div className="content">
          {notice && <div className={`notice ${notice.error ? "notice-error" : ""}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Fechar aviso">×</button></div>}
          <div className="metrics-grid">
            <article className="metric-card"><span className="metric-label">Produtos cadastrados</span><strong>{summary.products}</strong><span className="metric-foot">Itens no catálogo</span></article>
            <article className="metric-card"><span className="metric-label">Unidades em estoque</span><strong>{summary.stockUnits.toLocaleString("pt-BR")}</strong><span className="metric-foot">{summary.categories} categorias ativas</span></article>
            <article className="metric-card"><span className="metric-label">Estoque baixo</span><strong className={summary.lowStock ? "warning-value" : ""}>{summary.lowStock}</strong><span className="metric-foot">{summary.lowStock ? "Requer reposição" : "Tudo em dia"}</span></article>
          </div>

          <section className="inventory-card">
            <div className="inventory-heading">
              <div><h2>Catálogo de produtos</h2><p>Cadastre, consulte e atualize os produtos da loja.</p></div>
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="Buscar nome, categoria, cor..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar produtos" />
              </label>
            </div>
            <div className="product-grid">
                  {loadingProducts && <p className="empty-state">Buscando produtos...</p>}
                  {!loadingProducts && products.length === 0 && <p className="empty-state">{search ? "Nenhum produto encontrado para esta busca." : "Ainda não há produtos cadastrados."}</p>}
                  {!loadingProducts && products.map((product) => {
                    const isEmpty = product.stock === 0;
                    const isLow = product.stock <= product.minimum;
                    const primaryImage = product.images.find((image) => image.isPrimary);
                    return (
                      <article className="product-card" key={product.id}>
                        {primaryImage ? (
                          <img
                            className="product-thumbnail"
                            src={productImageUrl(product.id, primaryImage.id)}
                            crossOrigin="use-credentials"
                            alt={product.name}
                          />
                        ) : (
                          <div className="product-thumbnail thumbnail-placeholder" aria-label="Produto sem imagem">＋</div>
                        )}
                        <div className="product-card-content">
                          <div className="product-card-title"><strong>{product.name}</strong><span>{product.category}</span></div>
                          <div className="product-card-details">
                            <span>{product.size}{product.color ? ` · ${product.color}` : ""}</span>
                            <span><strong>{money(product.price)}</strong></span>
            </div>
                          <div className="product-card-footer">
                            <span><strong>{product.stock}</strong> un. · <span className={`status-text ${isEmpty ? "status-text-empty" : isLow ? "status-text-low" : "status-text-ok"}`}>{isEmpty ? "Esgotado" : isLow ? "Estoque baixo" : "Em estoque"}</span></span>
                            <div className="row-actions">
                              <button type="button" onClick={() => openEditProduct(product)} aria-label={`Editar ${product.name}`}>Editar</button>
                              <button type="button" className="delete-action" onClick={() => deleteProduct(product)} aria-label={`Excluir ${product.name}`}>Excluir</button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
          </section>
          <p className="data-note"><span className="secure-dot" /> Dados protegidos e salvos localmente no SQLite</p>
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!preparingImages && !saving && event.target === event.currentTarget) closeProductModal(); }}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">{editingProduct ? "ATUALIZAÇÃO DE CATÁLOGO" : "NOVO NO CATÁLOGO"}</p><h2 id="product-modal-title">{editingProduct ? "Editar produto" : "Cadastrar produto"}</h2></div>
              <button className="icon-button" type="button" onClick={closeProductModal} disabled={preparingImages || saving} aria-label="Fechar">×</button>
            </div>
            <form className="product-form" onSubmit={saveProduct}>
              <label className="field-wide">Nome do produto<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></label>
              <label>Categoria<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="" disabled>Selecione uma categoria</option>
                {!productCategories.includes(form.category) && form.category && <option value={form.category}>Atual: {form.category}</option>}
                {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select></label>
              <label>Tamanho<input maxLength={20} value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label>
              <label>Cor<input maxLength={50} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
              <label>Custo (R$)<input required type="number" min="0" max="99999999.99" step="0.01" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label>
              <label>Preço de venda (R$)<input required type="number" min="0" max="99999999.99" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label>Quantidade em estoque<input required type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              <label>Alerta de estoque mínimo<input required type="number" min="0" step="1" value={form.minimum} onChange={(event) => setForm({ ...form, minimum: event.target.value })} /></label>
              <section className="image-manager field-wide" aria-label="Imagens do produto">
                <div className="image-manager-heading"><div><strong>Imagens do produto</strong><span>JPEG, PNG ou WebP · arquivo de até 50 MB; convertido para até 4 MB antes do envio</span></div><span>{imageDrafts.length}/{maxProductImages}</span></div>
                <label className="image-upload-button">
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={preparingImages || imageDrafts.length >= maxProductImages} onChange={(event) => { void addImageFiles(event.target.files); event.currentTarget.value = ""; }} />
                  {preparingImages ? "Preparando imagens..." : "＋ Adicionar imagens"}
                </label>
                {preparingImages && <p className="image-preparing" role="status">As imagens são convertidas no navegador. O arquivo original só é enviado depois de ficar abaixo de 4 MB.</p>}
                {imageDrafts.length > 0 && <div className="image-draft-grid">
                  {imageDrafts.map((image) => (
                    <div className="image-draft" key={image.key}>
                      <img src={image.url} crossOrigin="use-credentials" alt="Prévia do produto" />
                      <label className="primary-image-choice"><input type="radio" name="primaryImage" checked={primaryImageKey === image.key} onChange={() => setPrimaryImageKey(image.key)} /> Principal</label>
                      <button type="button" className="remove-image-button" onClick={() => removeImageDraft(image)} aria-label="Remover imagem">×</button>
                    </div>
                  ))}
                </div>}
              </section>
              <div className="form-actions">
                <button className="button button-light" type="button" onClick={closeProductModal} disabled={saving || preparingImages}>Cancelar</button>
                <button className="button button-dark" type="submit" disabled={saving || preparingImages}>{preparingImages ? "Preparando imagens..." : saving ? "Salvando..." : editingProduct ? "Salvar alterações" : "Cadastrar produto"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
