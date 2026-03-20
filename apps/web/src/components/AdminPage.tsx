import { type FormEvent, useState } from "react";
import type { Account, AdminMetaApp } from "../types";

interface AdminPageProps {
  adminMetaApp: AdminMetaApp;
  onAdminMetaChange: (v: AdminMetaApp) => void;
  onSaveAdmin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  accounts: Account[];
  onCreateAccount: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateAgent: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  newAccountName: string;
  onNewAccountNameChange: (v: string) => void;
  agentForm: { accountId: string; name: string; email: string; password: string; role: string };
  onAgentFormChange: (v: AdminPageProps["agentForm"]) => void;
}

export function AdminPage({
  adminMetaApp,
  onAdminMetaChange,
  onSaveAdmin,
  accounts,
  onCreateAccount,
  onCreateAgent,
  newAccountName,
  onNewAccountNameChange,
  agentForm,
  onAgentFormChange,
}: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<"meta" | "accounts" | "agents">("meta");
  const meta = adminMetaApp;
  const set = (patch: Partial<AdminMetaApp>) => onAdminMetaChange({ ...meta, ...patch });
  const af = agentForm;
  const setAf = (patch: Partial<typeof agentForm>) => onAgentFormChange({ ...af, ...patch });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Platform Admin</p>
          <h2 className="page-title">Meta App, Accounts &amp; Agents</h2>
          <p className="page-sub">Set the shared Meta app once, then create accounts and add agents.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "meta" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("meta")}
        >
          ⚙️ Meta App
        </button>
        <button
          className={`tab-btn ${activeTab === "accounts" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("accounts")}
        >
          🏢 Accounts
          {accounts.length > 0 && <span className="tab-chip">{accounts.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === "agents" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("agents")}
        >
          👥 Agents
        </button>
      </div>

      {/* Meta App Tab */}
      {activeTab === "meta" && (
        <div className="card card--wide">
          <div className="card__header">
            <h3>Meta App Settings</h3>
            <p className="card__sub">Configure the shared Facebook/WhatsApp app credentials.</p>
          </div>
          <form className="form-stack" onSubmit={onSaveAdmin}>
            <div className="field toggle-field">
              <label htmlFor="admin-embedded">Enable Embedded Signup</label>
              <button
                type="button"
                role="switch"
                aria-checked={meta.embeddedSignupEnabled}
                className={`toggle ${meta.embeddedSignupEnabled ? "toggle--on" : ""}`}
                onClick={() => set({ embeddedSignupEnabled: !meta.embeddedSignupEnabled })}
              >
                <span className="toggle__thumb" />
              </button>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="admin-appid">Meta App ID</label>
                <input
                  id="admin-appid"
                  type="text"
                  placeholder="123456789"
                  value={meta.appId}
                  onChange={(e) => set({ appId: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-secret">Meta App Secret</label>
                <input
                  id="admin-secret"
                  type="password"
                  placeholder="••••••••"
                  value={meta.appSecret}
                  onChange={(e) => set({ appSecret: e.target.value })}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="admin-config">Configuration ID</label>
                <input
                  id="admin-config"
                  type="text"
                  value={meta.configurationId}
                  onChange={(e) => set({ configurationId: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-suat">System User Token</label>
                <input
                  id="admin-suat"
                  type="password"
                  placeholder="••••••••"
                  value={meta.systemUserAccessToken}
                  onChange={(e) => set({ systemUserAccessToken: e.target.value })}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="admin-verify">Verify Token</label>
                <input
                  id="admin-verify"
                  type="text"
                  value={meta.verifyToken}
                  onChange={(e) => set({ verifyToken: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-callback">Webhook Callback URL</label>
                <input
                  id="admin-callback"
                  type="url"
                  placeholder="https://yourapp.com/webhook"
                  value={meta.webhookCallbackUrl}
                  onChange={(e) => set({ webhookCallbackUrl: e.target.value })}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="admin-graph-url">Graph Base URL</label>
                <input
                  id="admin-graph-url"
                  type="text"
                  value={meta.graphBaseUrl}
                  onChange={(e) => set({ graphBaseUrl: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-graph-ver">Graph Version</label>
                <input
                  id="admin-graph-ver"
                  type="text"
                  value={meta.graphVersion}
                  onChange={(e) => set({ graphVersion: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary">Save Meta Settings</button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts Tab */}
      {activeTab === "accounts" && (
        <div className="admin-columns">
          <div className="card">
            <div className="card__header">
              <h3>Create Account</h3>
            </div>
            <form className="form-stack" onSubmit={onCreateAccount}>
              <div className="field">
                <label htmlFor="admin-acc-name">Account Name</label>
                <input
                  id="admin-acc-name"
                  type="text"
                  placeholder="Workspace account name"
                  value={newAccountName}
                  onChange={(e) => onNewAccountNameChange(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn--primary">Add Account</button>
            </form>
          </div>
          <div className="card">
            <div className="card__header">
              <h3>Accounts</h3>
              <span className="count-badge">{accounts.length}</span>
            </div>
            <div className="item-list">
              {accounts.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state__icon">🏢</span>
                  <p>No accounts yet.</p>
                </div>
              )}
              {accounts.map((account) => (
                <div key={account.id} className="item-row">
                  <div className="item-row__icon">🏢</div>
                  <div className="item-row__body">
                    <strong>{account.name}</strong>
                    <small>{account.slug} · {account.agents.length} agent{account.agents.length !== 1 ? "s" : ""}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agents Tab */}
      {activeTab === "agents" && (
        <div className="admin-columns">
          <div className="card">
            <div className="card__header">
              <h3>Add Agent</h3>
            </div>
            <form className="form-stack" onSubmit={onCreateAgent}>
              <div className="field">
                <label htmlFor="agent-account">Account</label>
                <select
                  id="agent-account"
                  value={af.accountId}
                  onChange={(e) => setAf({ accountId: e.target.value })}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="agent-name">Name</label>
                  <input
                    id="agent-name"
                    type="text"
                    value={af.name}
                    onChange={(e) => setAf({ name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="agent-role">Role</label>
                  <select
                    id="agent-role"
                    value={af.role}
                    onChange={(e) => setAf({ role: e.target.value })}
                  >
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="agent-email">Email</label>
                <input
                  id="agent-email"
                  type="email"
                  value={af.email}
                  onChange={(e) => setAf({ email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="agent-pass">Password</label>
                <input
                  id="agent-pass"
                  type="password"
                  value={af.password}
                  onChange={(e) => setAf({ password: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn--primary">Create Agent</button>
            </form>
          </div>
          <div className="card">
            <div className="card__header">
              <h3>Accounts &amp; Agents</h3>
            </div>
            <div className="item-list">
              {accounts.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state__icon">👥</span>
                  <p>No agents yet.</p>
                </div>
              )}
              {accounts.map((account) => (
                <div key={account.id}>
                  <p className="item-group-label">{account.name}</p>
                  {account.agents.length === 0 ? (
                    <p className="item-group-empty">No agents in this account</p>
                  ) : (
                    account.agents.map((agent) => (
                      <div key={agent.id} className="item-row">
                        <div className="avatar avatar--sm">
                          {agent.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div className="item-row__body">
                          <strong>{agent.name}</strong>
                          <small>{agent.email}</small>
                        </div>
                        <span className="tag tag--muted">{agent.role}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
