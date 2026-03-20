import { type FormEvent, useState } from "react";
import type { Account, Inbox, AdminMetaApp } from "../types";

interface SetupPageProps {
  accounts: Account[];
  inboxes: Inbox[];
  adminMetaApp: AdminMetaApp;
  onCreateManual: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onFinishEmbedded: () => Promise<void>;
  setupForm: {
    accountId: string;
    name: string;
    phoneNumber: string;
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    verifyToken: string;
  };
  onSetupFormChange: (form: SetupPageProps["setupForm"]) => void;
  embeddedCode: string;
  onEmbeddedCodeChange: (v: string) => void;
  sessionInfo: string;
  fbLoaded: boolean;
  onLaunchEmbedded: () => void;
}

const STEPS = [
  { num: 1, label: "Choose Channel", sub: "Embedded or manual setup" },
  { num: 2, label: "Create Inbox", sub: "Account, WABA, and phone" },
  { num: 3, label: "Add Agents", sub: "Attach team members" },
];

export function SetupPage({
  accounts,
  inboxes,
  adminMetaApp,
  onCreateManual,
  onFinishEmbedded,
  setupForm,
  onSetupFormChange,
  embeddedCode,
  onEmbeddedCodeChange,
  sessionInfo,
  fbLoaded,
  onLaunchEmbedded,
}: SetupPageProps) {
  const [mode, setMode] = useState<"embedded" | "manual">("embedded");

  const sf = setupForm;
  const set = (patch: Partial<typeof setupForm>) => onSetupFormChange({ ...sf, ...patch });

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Inboxes</p>
          <h2 className="page-title">Create WhatsApp Inbox</h2>
          <p className="page-sub">Use admin-managed embedded signup or a manual Cloud API connection.</p>
        </div>
        <span className="count-chip">{inboxes.length} inbox{inboxes.length !== 1 ? "es" : ""}</span>
      </div>

      <div className="setup-layout">
        {/* Steps */}
        <div className="card steps-card">
          <p className="card__label">Setup Steps</p>
          <div className="step-list">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`step-item ${i === 0 ? "step-item--done" : i === 1 ? "step-item--active" : ""}`}
              >
                <div className="step-item__dot">
                  {i === 0 ? (
                    <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
                    </svg>
                  ) : (
                    step.num
                  )}
                </div>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.sub}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-main">
          {/* Mode toggle */}
          <div className="card">
            <div className="pill-tabs">
              <button
                className={`pill-tab ${mode === "embedded" ? "pill-tab--active" : ""}`}
                onClick={() => setMode("embedded")}
              >
                <span>⚡</span> Quick Setup with Meta
              </button>
              <button
                className={`pill-tab ${mode === "manual" ? "pill-tab--active" : ""}`}
                onClick={() => setMode("manual")}
              >
                <span>⌘</span> Manual Setup
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="card">
            <form
              className="form-stack"
              onSubmit={mode === "manual" ? onCreateManual : (e) => e.preventDefault()}
            >
              <div className="field">
                <label htmlFor="setup-account">Account</label>
                <select
                  id="setup-account"
                  value={sf.accountId}
                  onChange={(e) => set({ accountId: e.target.value })}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="setup-name">Inbox Name</label>
                <input
                  id="setup-name"
                  type="text"
                  placeholder="Acme Support WhatsApp"
                  value={sf.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="setup-phone">Display Phone Number</label>
                <input
                  id="setup-phone"
                  type="text"
                  placeholder="+1 555 010 1000"
                  value={sf.phoneNumber}
                  onChange={(e) => set({ phoneNumber: e.target.value })}
                />
              </div>

              {mode === "embedded" ? (
                <div className="form-section">
                  <div className="status-strip">
                    <span className={`status-dot ${fbLoaded ? "status-dot--ok" : "status-dot--warn"}`} />
                    <span>FB SDK {fbLoaded ? "loaded" : "loading…"}</span>
                    <span className={`status-dot ${adminMetaApp.appId ? "status-dot--ok" : "status-dot--err"}`} />
                    <span>App ID {adminMetaApp.appId ? "OK" : "missing"}</span>
                    <span className={`status-dot ${adminMetaApp.configurationId ? "status-dot--ok" : "status-dot--err"}`} />
                    <span>Config ID {adminMetaApp.configurationId ? "OK" : "missing"}</span>
                  </div>
                  <button type="button" className="btn btn--primary" onClick={onLaunchEmbedded}>
                    Connect with WhatsApp Business
                  </button>
                  <div className="field">
                    <label htmlFor="setup-auth-code">Authorization Code</label>
                    <input
                      id="setup-auth-code"
                      type="text"
                      placeholder="Returned from FB.login callback"
                      value={embeddedCode}
                      onChange={(e) => onEmbeddedCodeChange(e.target.value)}
                    />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="setup-pnid">Phone Number ID</label>
                      <input
                        id="setup-pnid"
                        type="text"
                        value={sf.phoneNumberId}
                        onChange={(e) => set({ phoneNumberId: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="setup-waba">WABA ID</label>
                      <input
                        id="setup-waba"
                        type="text"
                        value={sf.businessAccountId}
                        onChange={(e) => set({ businessAccountId: e.target.value })}
                      />
                    </div>
                  </div>
                  <button type="button" className="btn btn--primary" onClick={onFinishEmbedded}>
                    Finish Embedded Signup →
                  </button>
                  {sessionInfo && (
                    <div className="code-block">
                      <p className="code-block__label">Session Info</p>
                      <pre>{sessionInfo}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="form-section">
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="setup-pnid-m">Phone Number ID</label>
                      <input
                        id="setup-pnid-m"
                        type="text"
                        value={sf.phoneNumberId}
                        onChange={(e) => set({ phoneNumberId: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="setup-baid">Business Account ID</label>
                      <input
                        id="setup-baid"
                        type="text"
                        value={sf.businessAccountId}
                        onChange={(e) => set({ businessAccountId: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="setup-token">API Key / Access Token</label>
                    <input
                      id="setup-token"
                      type="password"
                      value={sf.accessToken}
                      onChange={(e) => set({ accessToken: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="setup-verify">Verify Token</label>
                    <input
                      id="setup-verify"
                      type="text"
                      value={sf.verifyToken}
                      onChange={(e) => set({ verifyToken: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn--primary">Create WhatsApp Channel →</button>
                </div>
              )}
            </form>
          </div>

          {/* Existing inboxes */}
          {inboxes.length > 0 && (
            <div className="card">
              <div className="card__header">
                <h3>Existing Inboxes</h3>
                <span className="count-badge">{inboxes.length}</span>
              </div>
              <div className="item-list">
                {inboxes.map((inbox) => (
                  <div key={inbox.id} className="item-row">
                    <div className="item-row__icon">📱</div>
                    <div className="item-row__body">
                      <strong>{inbox.name}</strong>
                      <small>{inbox.account?.name} · {inbox.phoneNumber || "No phone"}</small>
                    </div>
                    <span className={`tag tag--${inbox.status}`}>{inbox.status}</span>
                    <span className="tag tag--muted">{inbox.connectionType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
