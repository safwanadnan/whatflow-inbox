import { useState, type FormEvent } from "react";
import type { SetupStatus } from "../types";

interface AuthPageProps {
  setupStatus: SetupStatus | null;
  onLogin: (email: string, password: string, accountId: string) => Promise<void>;
  onBootstrap: (name: string, email: string, password: string) => Promise<void>;
  error: string;
}

export function AuthPage({ setupStatus, onLogin, onBootstrap, error }: AuthPageProps) {
  const [loginForm, setLoginForm] = useState({ email: "", password: "", accountId: "" });
  const [bootstrapForm, setBootstrapForm] = useState({ name: "", email: "", password: "" });

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onLogin(loginForm.email, loginForm.password, loginForm.accountId);
  }

  async function handleBootstrap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onBootstrap(bootstrapForm.name, bootstrapForm.email, bootstrapForm.password);
  }

  if (setupStatus?.requiresBootstrap) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-card__header">
            <div className="auth-logo">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.12 1.527 5.855L0 24l6.335-1.527A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.806 9.806 0 01-5.006-1.364l-.36-.214-3.757.906.952-3.656-.235-.374A9.818 9.818 0 012.182 12C2.182 6.579 6.58 2.182 12 2.182c5.42 0 9.818 4.397 9.818 9.818 0 5.42-4.397 9.818-9.818 9.818z"/>
              </svg>
            </div>
            <h1>Whatflow</h1>
            <p className="auth-card__subtitle">First Run Setup</p>
          </div>
          <div className="auth-card__body">
            <h2 className="auth-card__form-title">Create Super Admin</h2>
            <p className="auth-card__hint">No platform admin exists yet. The first user becomes the super admin.</p>
            <form className="auth-form" onSubmit={handleBootstrap}>
              <div className="field">
                <label htmlFor="bs-name">Full Name</label>
                <input
                  id="bs-name"
                  type="text"
                  autoComplete="name"
                  placeholder="John Doe"
                  value={bootstrapForm.name}
                  onChange={(e) => setBootstrapForm({ ...bootstrapForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="bs-email">Email</label>
                <input
                  id="bs-email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  value={bootstrapForm.email}
                  onChange={(e) => setBootstrapForm({ ...bootstrapForm, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="bs-password">Password</label>
                <input
                  id="bs-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={bootstrapForm.password}
                  onChange={(e) => setBootstrapForm({ ...bootstrapForm, password: e.target.value })}
                />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="btn btn--primary btn--full">Create Super Admin</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card__header">
          <div className="auth-logo">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.12 1.527 5.855L0 24l6.335-1.527A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.806 9.806 0 01-5.006-1.364l-.36-.214-3.757.906.952-3.656-.235-.374A9.818 9.818 0 012.182 12C2.182 6.579 6.58 2.182 12 2.182c5.42 0 9.818 4.397 9.818 9.818 0 5.42-4.397 9.818-9.818 9.818z"/>
            </svg>
          </div>
          <h1>Whatflow</h1>
          <p className="auth-card__subtitle">Sign in to continue</p>
        </div>
        <div className="auth-card__body">
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="login-account">Account ID <span className="field__optional">(optional for agents)</span></label>
              <input
                id="login-account"
                type="text"
                placeholder="Leave blank for platform login"
                value={loginForm.accountId}
                onChange={(e) => setLoginForm({ ...loginForm, accountId: e.target.value })}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn btn--primary btn--full">Sign In</button>
          </form>
          {setupStatus?.seededFromEnv && (
            <p className="auth-card__footer-note">Initial super admin was seeded from environment variables.</p>
          )}
        </div>
      </div>
    </div>
  );
}
