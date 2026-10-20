"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const states = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
];

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  postalCode: string;
  state: string;
  city: string;
  street: string;
  neighborhood: string;
  role: "normal" | "vendedor" | "superadmin";
};

type Registration = {
  firstName: string;
  lastName: string;
  phone: string;
  postalCode: string;
  state: string;
  city: string;
  street: string;
  neighborhood: string;
  email: string;
  password: string;
};

const emptyRegistration: Registration = {
  firstName: "",
  lastName: "",
  phone: "",
  postalCode: "",
  state: "",
  city: "",
  street: "",
  neighborhood: "",
  email: "",
  password: "",
};

function redirectTarget(user: User): string {
  const requested = new URLSearchParams(window.location.search).get("returnTo") ?? "/";
  const safePath = requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\")
    ? requested
    : "/";
  if (user.role === "normal" && (safePath.startsWith("/painel-administrativo") || safePath.startsWith("/imagens-ia"))) {
    return "/";
  }
  return safePath;
}

function roleName(role: User["role"]): string {
  return role === "superadmin" ? "Superadmin" : role === "vendedor" ? "Vendedor" : "Normal";
}

export default function AccessPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [registration, setRegistration] = useState<Registration>(emptyRegistration);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Não foi possível validar sua sessão.");
        return response.json() as Promise<User>;
      })
      .then((profile) => {
        if (active && profile) setUser(profile);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível validar sua sessão.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const result = await response.json() as { user?: User; message?: string | string[] };
      if (!response.ok || !result.user) {
        throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "E-mail ou senha incorretos.");
      }
      window.location.assign(redirectTarget(result.user));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });
      const result = await response.json() as { user?: User; message?: string | string[] };
      if (!response.ok || !result.user) {
        throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "Não foi possível criar sua conta.");
      }
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar sua conta.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível encerrar sua sessão.");
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível encerrar sua sessão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-page">
      <header className="account-header">
        <a className="shop-wordmark" href="/">DELAWEAR<span>PY</span></a>
        <a href="/">Voltar à loja</a>
      </header>
      <section className="account-content">
        {checking ? <p role="status">Verificando sua sessão...</p> : user ? (
          <div className="account-card">
            <div className="account-card-heading">
              <span className="shop-account-avatar">{user.firstName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
              <div><h1>Olá, {user.firstName}</h1><p>{user.email} · {roleName(user.role)}</p></div>
            </div>
            <h2>Seus dados de cadastro</h2>
            <dl className="account-details">
              <div><dt>Telefone</dt><dd>{user.phone}</dd></div>
              <div><dt>Endereço</dt><dd>{user.street}, {user.neighborhood}</dd></div>
              <div><dt>Cidade</dt><dd>{user.city} — {user.state}</dd></div>
              <div><dt>CEP</dt><dd>{user.postalCode}</dd></div>
            </dl>
            <div className="account-actions">
              {user.role !== "normal" && <a className="shop-primary-button" href="/painel-administrativo">Abrir painel</a>}
              <button className="account-secondary-button" type="button" disabled={busy} onClick={() => void logout()}>{busy ? "Saindo..." : "Sair da conta"}</button>
            </div>
          </div>
        ) : (
          <div className="account-card">
            <h1>{mode === "login" ? "Entre na sua conta" : "Crie sua conta"}</h1>
            <p className="account-intro">{mode === "login" ? "Acompanhe sua conta e acesse sua experiência Delawear." : "Informe seus dados para criar seu cadastro na Delawear."}</p>
            <div className="account-tabs" role="tablist" aria-label="Acesso à conta">
              <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>Entrar</button>
              <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Criar conta</button>
            </div>
            {error && <p className="account-error" role="alert">{error}</p>}
            {mode === "login" ? (
              <form className="account-form" onSubmit={submitLogin}>
                <label>E-mail<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Senha<input type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <label className="account-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Manter sessão neste navegador</label>
                <button className="shop-primary-button" type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
              </form>
            ) : (
              <form className="account-form account-register-form" onSubmit={submitRegistration}>
                <label>Primeiro nome<input autoComplete="given-name" required maxLength={80} value={registration.firstName} onChange={(event) => setRegistration({ ...registration, firstName: event.target.value })} /></label>
                <label>Último nome<input autoComplete="family-name" required maxLength={100} value={registration.lastName} onChange={(event) => setRegistration({ ...registration, lastName: event.target.value })} /></label>
                <label>Telefone<input type="tel" autoComplete="tel" required minLength={10} maxLength={20} placeholder="(11) 99999-9999" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} /></label>
                <label>CEP<input autoComplete="postal-code" required pattern={String.raw`^\d{5}-?\d{3}$`} placeholder="00000-000" value={registration.postalCode} onChange={(event) => setRegistration({ ...registration, postalCode: event.target.value })} /></label>
                <label>Estado<select autoComplete="address-level1" required value={registration.state} onChange={(event) => setRegistration({ ...registration, state: event.target.value })}><option value="">Selecione</option>{states.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
                <label>Cidade<input autoComplete="address-level2" required maxLength={100} value={registration.city} onChange={(event) => setRegistration({ ...registration, city: event.target.value })} /></label>
                <label>Rua e número<input autoComplete="street-address" required maxLength={160} value={registration.street} onChange={(event) => setRegistration({ ...registration, street: event.target.value })} /></label>
                <label>Bairro<input required maxLength={100} value={registration.neighborhood} onChange={(event) => setRegistration({ ...registration, neighborhood: event.target.value })} /></label>
                <label className="account-field-wide">E-mail<input type="email" autoComplete="email" required maxLength={254} value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} /></label>
                <label className="account-field-wide">Senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} /><small>Use pelo menos 12 caracteres.</small></label>
                <button className="shop-primary-button account-field-wide" type="submit" disabled={busy}>{busy ? "Criando conta..." : "Criar conta"}</button>
              </form>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
