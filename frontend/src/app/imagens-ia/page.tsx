"use client";

import { useEffect, useState } from "react";
import ImageStudio from "../image-studio";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type User = { id: string; email: string };

export default function ImagesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace("/");
          return null;
        }
        if (!response.ok) throw new Error("Não foi possível validar sua sessão.");
        return response.json() as Promise<User>;
      })
      .then((profile) => {
        if (active && profile) setUser(profile);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível validar sua sessão.");
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível encerrar a sessão.");
      return;
    }
    window.location.replace("/");
  }

  if (checkingSession) {
    return <main className="screen-center"><p className="muted">Conectando ao Aura Studio...</p></main>;
  }

  if (!user) {
    return (
      <main className="screen-center">
        <div className="session-message">
          <p className="muted">{loadError || "Redirecionando para o acesso..."}</p>
          {loadError && <button className="button button-dark" type="button" onClick={() => window.location.reload()}>Tentar novamente</button>}
        </div>
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
        <a className="sidebar-link" href="/" title="Produtos e estoque"><span className="nav-icon">▤</span> Produtos &amp; estoque</a>
        <a className="sidebar-link active" href="/imagens-ia" aria-current="page" title="Imagens com IA"><span className="nav-icon">✳</span> Imagens com IA</a>
        <div className="sidebar-footer">
          <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <div className="user-details"><strong>{user.email}</strong><span>Administrador</span></div>
          <button className="icon-button" type="button" onClick={() => void logout()} title="Sair" aria-label="Sair">↪</button>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">ESTÚDIO DE CRIAÇÃO</p><h1>Imagens com IA</h1></div>
        </header>
        {loadError && <div className="studio-notice studio-notice-error" role="status">{loadError}</div>}
        <ImageStudio onUnauthorized={() => window.location.replace("/")} />
      </section>
    </main>
  );
}
