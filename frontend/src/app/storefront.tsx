"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const CART_STORAGE_KEY = "delawear-cart";
type StoreUser = {
  id: string;
  email: string;
  firstName: string;
  role: "normal" | "vendedor" | "superadmin";
};
type StoreSettings = { storeName: string; whatsapp: string; instagram: string };

type StoreProduct = {
  id: string;
  name: string;
  category: string;
  size: string;
  color: string;
  price: number;
  stock: number;
  images: Array<{ id: string; mimeType: string; isPrimary: boolean }>;
};
type CartItem = { productId: string; quantity: number };

function money(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function imageUrl(productId: string, imageId: string): string {
  return `${API_URL}/api/store/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`;
}

function variantKey(product: StoreProduct): string {
  return [product.name, product.category, product.color].map((value) => value.trim().toLocaleLowerCase("pt-BR")).join("|");
}

function productImage(product: StoreProduct, className: string) {
  const image = product.images.find((item) => item.isPrimary) ?? product.images[0];
  if (image) {
    return <img className={className} src={imageUrl(product.id, image.id)} alt={product.name} loading="lazy" />;
  }
  return (
    <div className={`${className} store-image-placeholder`} role="img" aria-label={`${product.name}, foto não cadastrada`}>
      <span>{product.category}</span>
    </div>
  );
}

function readCart(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem => (
      item && typeof item === "object"
      && "productId" in item && typeof item.productId === "string"
      && "quantity" in item && Number.isInteger(item.quantity) && item.quantity > 0
    ));
  } catch {
    return [];
  }
}

function ProductCard({ variants, onOpen }: { variants: StoreProduct[]; onOpen: (productId: string) => void }) {
  const product = variants.find((item) => item.stock > 0) ?? variants[0];
  const sizes = variants.map((item) => item.size).filter((size, index, all) => all.indexOf(size) === index);
  return (
    <article className="shop-product-card" data-shop-reveal>
      <button className="shop-product-link" type="button" onClick={() => onOpen(product.id)} aria-label={`Ver ${product.name}`}>
        {productImage(product, "shop-product-image")}
        <span className="shop-product-meta"><span>{product.category}</span><span>{product.stock > 0 ? "Disponível" : "Esgotado"}</span></span>
        <strong>{product.name}</strong>
        <span className="shop-product-subline">{product.color || "Cor única"} · {sizes.join(" / ")}</span>
        <span className="shop-product-price">{money(product.price)}</span>
      </button>
      <button className="shop-add-button" type="button" onClick={() => onOpen(product.id)} disabled={product.stock < 1}>
        {product.stock > 0 ? "Escolher tamanho" : "Indisponível"}
      </button>
    </article>
  );
}

export default function Storefront() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [storeUser, setStoreUser] = useState<StoreUser | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ storeName: "Delawear PY", whatsapp: "", instagram: "" });
  const [settingsError, setSettingsError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState("Todas");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedImageId, setSelectedImageId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_URL}/api/store/products`, { signal });
      if (!response.ok) throw new Error("Não foi possível carregar o catálogo da loja.");
      const result: unknown = await response.json();
      if (!Array.isArray(result)) throw new Error("A API retornou um catálogo inválido.");
      setProducts(result as StoreProduct[]);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os produtos.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(controller.signal);
    setCart(readCart());
    setCartLoaded(true);
    const syncRoute = () => {
      const productId = new URLSearchParams(window.location.search).get("produto") ?? "";
      setSelectedProductId(productId);
      setSelectedImageId("");
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => {
      controller.abort();
      window.removeEventListener("popstate", syncRoute);
    };
  }, [loadProducts]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/auth/me`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Não foi possível validar sua sessão.");
        return response.json() as Promise<StoreUser>;
      })
      .then((profile) => { if (profile) setStoreUser(profile); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setNotice(error instanceof Error ? error.message : "Não foi possível validar sua sessão.");
        }
      });
    fetch(`${API_URL}/api/store/settings`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as configurações da loja.");
        return response.json() as Promise<StoreSettings>;
      })
      .then(setStoreSettings)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSettingsError(error instanceof Error ? error.message : "Não foi possível carregar as configurações da loja.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      setNotice("Não foi possível salvar o carrinho neste navegador.");
    }
  }, [cart, cartLoaded]);

  useEffect(() => {
    if (!products.length || !cartLoaded) return;
    const available = new Map(products.map((product) => [product.id, product.stock]));
    setCart((current) => current.flatMap((item) => {
      const stock = available.get(item.productId);
      return stock ? [{ ...item, quantity: Math.min(item.quantity, stock) }] : [];
    }));
  }, [products, cartLoaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const root = document.querySelector(".storefront");
    if (!root) return;
    const targets = [...root.querySelectorAll<HTMLElement>("[data-shop-reveal]")];
    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("shop-reveal-visible"));
      return;
    }

    root.classList.add("shop-reveal-ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("shop-reveal-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach((target, index) => {
      target.style.setProperty("--shop-reveal-delay", `${(index % 4) * 70}ms`);
      observer.observe(target);
    });
    return () => observer.disconnect();
  }, [products.length, selectedProductId]);

  const categories = useMemo(
    () => ["Todas", ...new Set(products.map((product) => product.category))],
    [products],
  );
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => (
      (category === "Todas" || product.category === category)
      && (!query || `${product.name} ${product.color} ${product.size} ${product.category}`.toLocaleLowerCase("pt-BR").includes(query))
    ));
  }, [category, products, search]);
  const productGroups = useMemo(() => {
    const groups = new Map<string, StoreProduct[]>();
    for (const product of visibleProducts) {
      const key = variantKey(product);
      groups.set(key, [...(groups.get(key) ?? []), product]);
    }
    return [...groups.values()];
  }, [visibleProducts]);
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const featuredProduct = products.find((product) => product.images.length > 0);
  const relatedGroups = useMemo(() => {
    if (!selectedProduct) return [];
    const groups = new Map<string, StoreProduct[]>();
    for (const product of products) {
      if (product.category !== selectedProduct.category || variantKey(product) === variantKey(selectedProduct)) continue;
      const key = variantKey(product);
      groups.set(key, [...(groups.get(key) ?? []), product]);
    }
    return [...groups.values()].slice(0, 4);
  }, [products, selectedProduct]);
  const selectedVariants = selectedProduct
    ? products.filter((product) => variantKey(product) === variantKey(selectedProduct))
    : [];
  const selectedImage = selectedProduct?.images.find((image) => image.id === selectedImageId)
    ?? selectedProduct?.images.find((image) => image.isPrimary)
    ?? selectedProduct?.images[0];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartLines = cart.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return product ? [{ ...item, product }] : [];
  });
  const cartTotal = cartLines.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  function navigateToProduct(productId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("produto", productId);
    window.history.pushState({}, "", url);
    setSelectedProductId(productId);
    setSelectedImageId("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateHome() {
    const url = new URL(window.location.href);
    url.searchParams.delete("produto");
    window.history.pushState({}, "", url);
    setSelectedProductId("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToCart(product: StoreProduct) {
    if (product.stock < 1) return;
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing && existing.quantity >= product.stock) {
        setNotice("Não há mais unidades disponíveis desse tamanho.");
        return current;
      }
      setNotice("Peça adicionada ao carrinho.");
      return existing
        ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId: product.id, quantity: 1 }];
    });
    setCartOpen(true);
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const product = products.find((candidate) => candidate.id === productId);
      const quantity = Math.min(product?.stock ?? 0, item.quantity + delta);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  }

  function whatsappLink() {
    const phone = storeSettings.whatsapp.replace(/\D/g, "");
    if (!phone || !cartLines.length) return "";
    const lines = [
      "Olá! Quero fazer este pedido na Delawear PY:",
      "",
      ...cartLines.map(({ product, quantity }) => (
        `${quantity}x ${product.name} · tam. ${product.size} · ${money(product.price * quantity)}`
      )),
      "",
      `Total: ${money(cartTotal)}`,
      "Pode confirmar a disponibilidade e combinar pagamento e entrega?",
    ];
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  async function logout() {
    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível encerrar sua sessão.");
      setStoreUser(null);
      setNotice("Sessão encerrada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível encerrar sua sessão.");
    }
  }

  return (
    <main className="storefront">
      <header className="shop-header">
        <a className="shop-wordmark" href="/" aria-label={`${storeSettings.storeName}, início`}>{storeSettings.storeName}</a>
        <nav className="shop-nav" aria-label="Navegação principal">
          <a href="/#colecao">Coleção</a>
          <a href="/#sobre">A marca</a>
          <a href="/#duvidas">Dúvidas</a>
          {storeUser && storeUser.role !== "normal" && <a className="shop-admin-link" href="/painel-administrativo">Painel administrativo ↗</a>}
        </nav>
        <div className="shop-header-actions">
          <button className="shop-cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho, ${cartCount} itens`}>
            Carrinho <span>{cartCount}</span>
          </button>
          <a className="shop-account-link" href="/acesso" aria-label={storeUser ? `Conta de ${storeUser.firstName || storeUser.email}` : "Entrar ou criar uma conta"}>
            <span className="shop-account-avatar" aria-hidden="true">
              {storeUser?.firstName ? storeUser.firstName.slice(0, 1).toLocaleUpperCase("pt-BR") : (
                <svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.5-4 3.2-6 7.5-6s7 2 7.5 6" /></svg>
              )}
            </span>
            <span>{storeUser ? storeUser.firstName || "Conta" : "Entrar"}</span>
          </a>
          {storeUser && <button className="shop-logout-button" type="button" onClick={() => void logout()}>Sair</button>}
        </div>
      </header>
      {settingsError && <p className="shop-error wrap" role="alert">{settingsError}</p>}

      {selectedProduct ? (
        <section className="shop-detail wrap">
          <button className="shop-back-link" type="button" onClick={navigateHome}>← Voltar à coleção</button>
          <div className="shop-detail-grid">
            <div className="shop-gallery">
              <div className="shop-detail-main">
                {selectedImage
                  ? <img src={imageUrl(selectedProduct.id, selectedImage.id)} alt={selectedProduct.name} />
                  : <div className="store-image-placeholder" role="img" aria-label={`${selectedProduct.name}, foto não cadastrada`}><span>{selectedProduct.category}</span></div>}
              </div>
              {selectedProduct.images.length > 1 && <div className="shop-thumbnails">
                {selectedProduct.images.map((image) => <button type="button" key={image.id} aria-pressed={image.id === selectedImage?.id} onClick={() => setSelectedImageId(image.id)}><img src={imageUrl(selectedProduct.id, image.id)} alt={`Ver outra foto de ${selectedProduct.name}`} /></button>)}
              </div>}
            </div>
            <div className="shop-detail-info">
              <p className="shop-detail-category">{selectedProduct.category}</p>
              <h1>{selectedProduct.name}</h1>
              <p className="shop-detail-price">{money(selectedProduct.price)}</p>
              <p className="shop-detail-color">Cor <strong>{selectedProduct.color || "Única"}</strong></p>
              <h2>Tamanho</h2>
              <div className="shop-size-options" role="group" aria-label="Escolha o tamanho">
                {selectedVariants.map((variant) => <button key={variant.id} type="button" aria-pressed={variant.id === selectedProduct.id} disabled={variant.stock < 1} onClick={() => navigateToProduct(variant.id)}>{variant.size}</button>)}
              </div>
              <p className="shop-stock-note" role="status">{selectedProduct.stock > 0 ? `${selectedProduct.stock} unidade(s) disponível(is)` : "Tamanho esgotado"}</p>
              <button className="shop-primary-button" type="button" disabled={selectedProduct.stock < 1} onClick={() => addToCart(selectedProduct)}>Adicionar ao carrinho</button>
              <div className="shop-product-description"><h2>Sobre a peça</h2><p>Uma peça Delawear para acompanhar seu ritmo. Consulte nossa equipe pelo WhatsApp para medidas, tecido e disponibilidade.</p></div>
            </div>
          </div>
          {relatedGroups.length > 0 && <section className="shop-related"><h2>Mais em {selectedProduct.category.toLocaleLowerCase("pt-BR")}</h2><div className="shop-product-grid">{relatedGroups.map((variants) => <ProductCard key={variantKey(variants[0])} variants={variants} onOpen={navigateToProduct} />)}</div></section>}
        </section>
      ) : selectedProductId ? (
        <section className="shop-detail wrap"><button className="shop-back-link" type="button" onClick={navigateHome}>← Voltar à coleção</button><h1>Peça não encontrada</h1><p className="shop-state">Esta peça não está mais no catálogo. Escolha outra opção na loja.</p></section>
      ) : (
        <>
          <section className="shop-hero">
            <div className="shop-hero-top">
              <h1>DELAWEAR</h1>
                <div className="shop-hero-feature" data-shop-reveal>
                  <p>Loja online de roupas e streetwear oversized da Delawear PY.</p>
                {featuredProduct ? (
                  <button className="shop-hero-image" type="button" onClick={() => navigateToProduct(featuredProduct.id)} aria-label={`Conheça ${featuredProduct.name}`}>
                    {productImage(featuredProduct, "shop-hero-product-photo")}
                    <span>Em destaque · {featuredProduct.name}</span>
                  </button>
                ) : (
                  <div className="shop-hero-poster" aria-hidden="true"><span>Oversized<br />no ponto</span></div>
                )}
              </div>
            </div>
            <div className="shop-hero-bottom">
              <a className="shop-primary-button" href="#colecao">Ver coleção <span>↓</span></a>
              <span>Caimento solto. Presença própria.</span>
            </div>
          </section>
          <div className="shop-marquee" aria-label="Streetwear oversized · roupa para viver a rua">
            <div className="shop-marquee-track"><span>OVERSIZED <i /> SKATE <i /> BALADA <i /> RUA <i /> PEÇAS PARA VIVER <i /> OVERSIZED <i /> SKATE <i /> BALADA <i /> RUA <i /> PEÇAS PARA VIVER <i /></span></div>
          </div>

          <section className="shop-catalog wrap" id="colecao">
            <div className="shop-section-heading" data-shop-reveal>
              <div><h2>A coleção</h2><p>O catálogo é atualizado com as peças cadastradas pela loja.</p></div>
              <label className="shop-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar peça ou cor" aria-label="Buscar produtos" /></label>
            </div>
            <div className="shop-filters" role="group" aria-label="Filtrar por categoria">
              {categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            {loading ? <p className="shop-state">Carregando peças da loja...</p>
              : loadError ? <div className="shop-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadProducts()}>Tentar novamente</button></div>
                : productGroups.length ? <div className="shop-product-grid">{productGroups.map((variants) => <ProductCard key={variantKey(variants[0])} variants={variants} onOpen={navigateToProduct} />)}</div>
                  : <p className="shop-state">{products.length ? "Nenhuma peça encontrada. Tente outra busca ou categoria." : "Ainda não há produtos no catálogo. As peças cadastradas no painel aparecerão aqui."}</p>}
          </section>

          <section className="shop-story" id="sobre">
            <div className="wrap shop-story-grid">
              <h2 data-shop-reveal>Seu ritmo. Seu estilo.</h2>
              <div data-shop-reveal><p>A Delawear veste a liberdade de ir da rua para onde a noite levar. Modelagens oversized, escolhas sem excesso e espaço para cada pessoa usar do seu jeito.</p><a href="#colecao">Encontrar sua peça ↓</a></div>
            </div>
          </section>
          <section className="shop-buying wrap">
            <h2 data-shop-reveal>Comprar é simples.</h2>
            <div className="shop-buying-steps">
              <article data-shop-reveal><strong>Escolha sua peça</strong><p>Explore o catálogo atualizado pela loja e veja preços e tamanhos disponíveis.</p></article>
              <article data-shop-reveal><strong>Monte o carrinho</strong><p>Selecione o tamanho e a quantidade. Seu carrinho fica salvo neste navegador.</p></article>
              <article data-shop-reveal><strong>Combine pelo WhatsApp</strong><p>Enviamos seu pedido para confirmar disponibilidade, pagamento e entrega.</p></article>
            </div>
          </section>
          <section className="shop-faq" id="duvidas">
            <div className="wrap shop-faq-grid">
              <h2 data-shop-reveal>Dúvidas frequentes</h2>
              <div data-shop-reveal>
                <details><summary>Como faço meu pedido?</summary><p>Escolha as peças e os tamanhos, adicione ao carrinho e finalize pelo WhatsApp. A equipe confirma o pedido com você.</p></details>
                <details><summary>Como escolher o tamanho?</summary><p>As peças têm modelagem oversized. Se precisar de medidas, fale com a equipe antes de confirmar.</p></details>
                <details><summary>Como funciona o pagamento e a entrega?</summary><p>Pagamento e entrega são combinados diretamente no atendimento após a confirmação da disponibilidade.</p></details>
              </div>
            </div>
          </section>
          <section className="shop-contact">
            <div className="wrap"><h2 data-shop-reveal>Vista o seu ritmo.</h2><a className="shop-primary-button shop-dark-button" data-shop-reveal href="#colecao">Explorar a coleção</a></div>
          </section>
        </>
      )}

      <footer className="shop-footer">
        <div className="wrap shop-footer-main"><a className="shop-wordmark" href="/">{storeSettings.storeName}</a><div><a href="/#colecao">Coleção</a><a href="/#duvidas">Ajuda</a>{storeSettings.instagram && <a href={storeSettings.instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}{storeUser && storeUser.role !== "normal" && <a href="/painel-administrativo">Painel administrativo</a>}</div></div>
        <div className="wrap shop-footer-note"><span>Streetwear para a vida em movimento.</span><span>© {new Date().getFullYear()} {storeSettings.storeName}</span></div>
      </footer>

      {cartOpen && <div className="shop-cart-layer">
        <button className="shop-cart-overlay" type="button" aria-label="Fechar carrinho" onClick={() => setCartOpen(false)} />
        <aside className="shop-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="shop-cart-title">
          <div className="shop-cart-heading"><h2 id="shop-cart-title">Seu carrinho <span>{cartCount}</span></h2><button type="button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">Fechar ×</button></div>
          <div className="shop-cart-lines">
            {!cartLines.length ? <p>Seu carrinho está vazio. Escolha uma peça e um tamanho para começar.</p> : cartLines.map(({ product, quantity }) => <article className="shop-cart-line" key={product.id}>
              {productImage(product, "shop-cart-image")}
              <div><strong>{product.name}</strong><span>Tamanho {product.size} · {money(product.price)}</span><div className="shop-quantity"><button type="button" aria-label={`Diminuir ${product.name}`} onClick={() => updateQuantity(product.id, -1)}>−</button><span>{quantity}</span><button type="button" aria-label={`Aumentar ${product.name}`} disabled={quantity >= product.stock} onClick={() => updateQuantity(product.id, 1)}>＋</button><button className="shop-remove" type="button" onClick={() => setCart((current) => current.filter((item) => item.productId !== product.id))}>Remover</button></div></div>
              <strong>{money(product.price * quantity)}</strong>
            </article>)}
          </div>
          <div className="shop-cart-footer">
            <div><span>Total</span><strong>{money(cartTotal)}</strong></div>
            {storeSettings.whatsapp.replace(/\D/g, "") ? <a className="shop-primary-button" href={whatsappLink()} target="_blank" rel="noopener noreferrer" aria-disabled={!cartLines.length} onClick={(event) => { if (!cartLines.length) event.preventDefault(); }}>Finalizar pelo WhatsApp ↗</a>
              : <p>O WhatsApp da loja ainda não foi configurado. Entre em contato pelo Instagram.</p>}
            <small>O pagamento e a entrega são combinados no atendimento.</small>
          </div>
        </aside>
      </div>}
      {notice && <div className="shop-toast" role="status" aria-live="polite">{notice}</div>}
    </main>
  );
}
