import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type Agent = { id: string; accountId: string; name: string; email: string; role: "admin" | "manager" | "agent" };
type Account = { id: string; name: string; slug: string; agents: Agent[] };
type Inbox = {
  id: string;
  accountId: string;
  name: string;
  connectionType: "embedded" | "manual";
  status: "draft" | "connected";
  phoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  account?: Account;
};
type Conversation = { id: string; inboxId: string; title: string; lastMessagePreview: string; unreadCount: number; inbox?: Inbox };
type Message = { id: string; type: string; direction: "incoming" | "outgoing" | "status"; text?: string; timestamp: string; status?: string };
type ConversationDetail = { conversation: Conversation; inbox?: Inbox; contact?: { name: string }; messages: Message[] };
type AdminMetaApp = {
  embeddedSignupEnabled: boolean;
  appId: string;
  appSecret: string;
  configurationId: string;
  verifyToken: string;
  systemUserAccessToken: string;
  graphBaseUrl: string;
  graphVersion: string;
  webhookCallbackUrl: string;
};
type Bootstrap = { adminMetaApp: AdminMetaApp; accounts: Account[]; inboxes: Inbox[]; conversations: Array<Conversation & { inbox?: Inbox }> };
type View = "setup" | "admin" | "inbox";

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

const defaultAdmin: AdminMetaApp = {
  embeddedSignupEnabled: false,
  appId: "",
  appSecret: "",
  configurationId: "",
  verifyToken: "",
  systemUserAccessToken: "",
  graphBaseUrl: "https://graph.facebook.com",
  graphVersion: "v23.0",
  webhookCallbackUrl: "",
};

export default function App() {
  const [view, setView] = useState<View>("setup");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [conversations, setConversations] = useState<Array<Conversation & { inbox?: Inbox }>>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [adminMetaApp, setAdminMetaApp] = useState<AdminMetaApp>(defaultAdmin);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState("");
  const [fbLoaded, setFbLoaded] = useState(false);
  const [embeddedCode, setEmbeddedCode] = useState("");
  const [sessionInfo, setSessionInfo] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [agentForm, setAgentForm] = useState({ accountId: "", name: "", email: "", role: "agent" });
  const [mode, setMode] = useState<"embedded" | "manual">("embedded");
  const [setupForm, setSetupForm] = useState({
    accountId: "",
    name: "",
    phoneNumber: "",
    phoneNumberId: "",
    businessAccountId: "",
    accessToken: "",
    verifyToken: "",
  });

  async function loadBootstrap() {
    const data = await request<Bootstrap>("/api/bootstrap");
    setAccounts(data.accounts);
    setInboxes(data.inboxes);
    setConversations(data.conversations);
    setAdminMetaApp({ ...defaultAdmin, ...data.adminMetaApp, appSecret: "", systemUserAccessToken: "" });
    const firstAccount = data.accounts[0]?.id ?? "";
    setSetupForm((current) => ({ ...current, accountId: current.accountId || firstAccount }));
    setAgentForm((current) => ({ ...current, accountId: current.accountId || firstAccount }));
    if (!selectedConversationId && data.conversations[0]) setSelectedConversationId(data.conversations[0].id);
  }

  async function loadConversation(id: string) {
    setDetail(await request<ConversationDetail>(`/api/conversations/${id}`));
  }

  useEffect(() => {
    void loadBootstrap().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (selectedConversationId) void loadConversation(selectedConversationId).catch((err: Error) => setError(err.message));
  }, [selectedConversationId]);

  useEffect(() => {
    window.fbAsyncInit = function () {
      if (!window.FB || !adminMetaApp.appId) return;
      window.FB.init({
        appId: adminMetaApp.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: adminMetaApp.graphVersion || "v25.0",
      });
      setFbLoaded(true);
    };
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    document.body.appendChild(script);
    const onMessage = (event: MessageEvent<string>) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = JSON.parse(event.data) as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          setSessionInfo(JSON.stringify(data, null, 2));
          if (data.event === "FINISH") {
            setSetupForm((current) => ({
              ...current,
              phoneNumberId: data.data?.phone_number_id ?? current.phoneNumberId,
              businessAccountId: data.data?.waba_id ?? current.businessAccountId,
            }));
          }
        }
      } catch {
        return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      script.remove();
    };
  }, [adminMetaApp.appId, adminMetaApp.graphVersion]);

  async function saveAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      await request("/api/admin/meta-app", { method: "PUT", body: JSON.stringify(adminMetaApp) });
      await loadBootstrap();
      setSuccess("Admin Meta app settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save admin");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newAccountName.trim()) return;
    setError("");
    setSuccess("");
    try {
      await request("/api/accounts", { method: "POST", body: JSON.stringify({ name: newAccountName }) });
      setNewAccountName("");
      await loadBootstrap();
      setSuccess("Account created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      await request(`/api/accounts/${agentForm.accountId}/agents`, { method: "POST", body: JSON.stringify(agentForm) });
      setAgentForm((current) => ({ ...current, name: "", email: "", role: "agent" }));
      await loadBootstrap();
      setSuccess("Agent created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    }
  }

  async function createManualInbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      await request("/api/inboxes", { method: "POST", body: JSON.stringify({ ...setupForm, connectionType: "manual" }) });
      await loadBootstrap();
      setSuccess("Manual inbox created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create inbox");
    }
  }

  function launchEmbeddedSignup() {
    if (!window.FB || !adminMetaApp.configurationId) {
      setError("Facebook SDK or Meta configuration ID is missing.");
      return;
    }
    window.FB.login(
      (response) => setEmbeddedCode(response.authResponse?.code ?? ""),
      {
        config_id: adminMetaApp.configurationId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          version: "v3",
          sessionInfoVersion: "3",
          setup: {
            business: { id: null, phone: {}, address: {}, timezone: null },
            phone: { category: null, description: "" },
          },
        },
      },
    );
  }

  async function finishEmbeddedSignup() {
    setError("");
    setSuccess("");
    try {
      await request("/api/inboxes/embedded/exchange", {
        method: "POST",
        body: JSON.stringify({
          accountId: setupForm.accountId,
          name: setupForm.name,
          phoneNumber: setupForm.phoneNumber,
          phoneNumberId: setupForm.phoneNumberId,
          wabaId: setupForm.businessAccountId,
          code: embeddedCode,
          redirectUri: adminMetaApp.webhookCallbackUrl || window.location.origin,
        }),
      });
      await loadBootstrap();
      setSuccess("Embedded signup inbox created.");
      setView("inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish embedded signup");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversationId || !draft.trim()) return;
    setError("");
    setSuccess("");
    try {
      await request(`/api/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: draft }),
      });
      setDraft("");
      await loadConversation(selectedConversationId);
      await loadBootstrap();
      setSuccess("Message sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Self-hostable WhatsApp Inbox</p>
          <h1>Whatflow</h1>
          <p className="lede">PostgreSQL, Prisma, embedded signup, accounts, and agents.</p>
        </div>
        <nav className="nav-stack">
          <button className={`nav-card ${view === "setup" ? "active" : ""}`} onClick={() => setView("setup")}><strong>Create Inbox</strong><span>Embedded or manual</span></button>
          <button className={`nav-card ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}><strong>Admin</strong><span>Meta app, accounts, agents</span></button>
          <button className={`nav-card ${view === "inbox" ? "active" : ""}`} onClick={() => setView("inbox")}><strong>Inbox</strong><span>{conversations.length} conversations</span></button>
        </nav>
        <div className="panel">
          <div className="panel-header"><h2>Accounts</h2><span>{accounts.length}</span></div>
          <div className="token-list">
            {accounts.map((account) => (
              <div key={account.id} className="token">
                <strong>{account.name}</strong>
                <span>{account.slug}</span>
                <small>{account.agents.length} agents</small>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="workspace">
        {view === "setup" && (
          <>
            <section className="hero panel">
              <div>
                <p className="eyebrow">Inboxes</p>
                <h2>Create WhatsApp Inbox</h2>
                <p className="lede">Use admin-managed embedded signup or a manual Cloud API connection.</p>
              </div>
            </section>
            <section className="setup-layout">
              <div className="panel setup-steps">
                <div className="step-item is-complete"><span>1</span><div><strong>Choose Channel</strong><p>Embedded signup or manual.</p></div></div>
                <div className="step-item is-active"><span>2</span><div><strong>Create Inbox</strong><p>Store the account, WABA, and phone details.</p></div></div>
                <div className="step-item"><span>3</span><div><strong>Add Agents</strong><p>Attach team members to the account.</p></div></div>
              </div>
              <div className="stack">
                <section className="panel">
                  <div className="choice-grid">
                    <button className={`choice-card ${mode === "embedded" ? "active" : ""}`} onClick={() => setMode("embedded")}><strong>Quick setup with Meta</strong><span>Launch FB SDK embedded signup</span></button>
                    <button className={`choice-card ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}><strong>Manual setup</strong><span>Paste WABA/token details</span></button>
                  </div>
                </section>
                <section className="panel">
                  <form className="config-form" onSubmit={mode === "manual" ? createManualInbox : (event) => event.preventDefault()}>
                    <label>Account<select value={setupForm.accountId} onChange={(event) => setSetupForm({ ...setupForm, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                    <label>Inbox Name<input value={setupForm.name} onChange={(event) => setSetupForm({ ...setupForm, name: event.target.value })} placeholder="Acme Support WhatsApp" /></label>
                    <label>Display Phone Number<input value={setupForm.phoneNumber} onChange={(event) => setSetupForm({ ...setupForm, phoneNumber: event.target.value })} placeholder="+1 555 010 1000" /></label>
                    {mode === "embedded" ? (
                      <>
                        <div className="token"><strong>Embedded status</strong><small>SDK: {fbLoaded ? "loaded" : "loading"} | App ID: {adminMetaApp.appId ? "ok" : "missing"} | Config ID: {adminMetaApp.configurationId ? "ok" : "missing"}</small></div>
                        <button type="button" onClick={launchEmbeddedSignup}>Connect with WhatsApp Business</button>
                        <label>Authorization Code<input value={embeddedCode} onChange={(event) => setEmbeddedCode(event.target.value)} placeholder="Returned from FB.login callback" /></label>
                        <label>Phone Number ID<input value={setupForm.phoneNumberId} onChange={(event) => setSetupForm({ ...setupForm, phoneNumberId: event.target.value })} /></label>
                        <label>WABA ID<input value={setupForm.businessAccountId} onChange={(event) => setSetupForm({ ...setupForm, businessAccountId: event.target.value })} /></label>
                        <button type="button" onClick={finishEmbeddedSignup}>Finish Embedded Signup</button>
                        {sessionInfo && <div className="token"><strong>Session Info</strong><small>{sessionInfo}</small></div>}
                      </>
                    ) : (
                      <>
                        <label>Phone Number ID<input value={setupForm.phoneNumberId} onChange={(event) => setSetupForm({ ...setupForm, phoneNumberId: event.target.value })} /></label>
                        <label>Business Account ID<input value={setupForm.businessAccountId} onChange={(event) => setSetupForm({ ...setupForm, businessAccountId: event.target.value })} /></label>
                        <label>API Key / Access Token<input type="password" value={setupForm.accessToken} onChange={(event) => setSetupForm({ ...setupForm, accessToken: event.target.value })} /></label>
                        <label>Verify Token<input value={setupForm.verifyToken} onChange={(event) => setSetupForm({ ...setupForm, verifyToken: event.target.value })} /></label>
                        <button type="submit">Create WhatsApp Channel</button>
                      </>
                    )}
                  </form>
                </section>
                <section className="panel">
                  <div className="panel-header"><h3>Inboxes</h3><span>{inboxes.length}</span></div>
                  <div className="token-list">
                    {inboxes.map((inbox) => (
                      <div key={inbox.id} className="token">
                        <strong>{inbox.name}</strong>
                        <span>{inbox.connectionType} | {inbox.status}</span>
                        <small>{inbox.account?.name ?? "Account"} | /webhooks/whatsapp/{inbox.id}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          </>
        )}

        {view === "admin" && (
          <>
            <section className="hero panel"><div><p className="eyebrow">Admin</p><h2>Meta App, Accounts, and Agents</h2><p className="lede">Set the shared Meta app once, then create accounts and add agents under each account.</p></div></section>
            <section className="grid">
              <article className="panel">
                <form className="config-form" onSubmit={saveAdmin}>
                  <label className="toggle-row"><span>Enable Embedded Signup</span><input type="checkbox" checked={adminMetaApp.embeddedSignupEnabled} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, embeddedSignupEnabled: event.target.checked })} /></label>
                  <label>Meta App ID<input value={adminMetaApp.appId} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, appId: event.target.value })} /></label>
                  <label>Meta App Secret<input type="password" value={adminMetaApp.appSecret} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, appSecret: event.target.value })} /></label>
                  <label>Configuration ID<input value={adminMetaApp.configurationId} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, configurationId: event.target.value })} /></label>
                  <label>System User Token<input type="password" value={adminMetaApp.systemUserAccessToken} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, systemUserAccessToken: event.target.value })} /></label>
                  <label>Verify Token<input value={adminMetaApp.verifyToken} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, verifyToken: event.target.value })} /></label>
                  <label>Redirect / Callback URL<input value={adminMetaApp.webhookCallbackUrl} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, webhookCallbackUrl: event.target.value })} /></label>
                  <div className="inline-grid">
                    <label>Graph Base URL<input value={adminMetaApp.graphBaseUrl} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, graphBaseUrl: event.target.value })} /></label>
                    <label>Graph Version<input value={adminMetaApp.graphVersion} onChange={(event) => setAdminMetaApp({ ...adminMetaApp, graphVersion: event.target.value })} /></label>
                  </div>
                  <button type="submit">Save Admin Meta Settings</button>
                </form>
              </article>
              <aside className="stack">
                <section className="panel">
                  <div className="panel-header"><h3>Create Account</h3></div>
                  <form className="config-form" onSubmit={createAccount}>
                    <input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="Workspace account name" />
                    <button type="submit">Add Account</button>
                  </form>
                </section>
                <section className="panel">
                  <div className="panel-header"><h3>Add Agent</h3></div>
                  <form className="config-form" onSubmit={createAgent}>
                    <label>Account<select value={agentForm.accountId} onChange={(event) => setAgentForm({ ...agentForm, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                    <label>Name<input value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} /></label>
                    <label>Email<input value={agentForm.email} onChange={(event) => setAgentForm({ ...agentForm, email: event.target.value })} /></label>
                    <label>Role<select value={agentForm.role} onChange={(event) => setAgentForm({ ...agentForm, role: event.target.value })}><option value="agent">Agent</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
                    <button type="submit">Create Agent</button>
                  </form>
                </section>
                <section className="panel">
                  <div className="panel-header"><h3>Accounts and Agents</h3></div>
                  <div className="token-list">
                    {accounts.map((account) => (
                      <div key={account.id} className="token">
                        <strong>{account.name}</strong>
                        <span>{account.slug}</span>
                        <small>{account.agents.map((agent) => `${agent.name} (${agent.role})`).join(", ") || "No agents yet"}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </section>
          </>
        )}

        {view === "inbox" && (
          <>
            <section className="hero panel"><div><p className="eyebrow">Inbox</p><h2>{detail?.contact?.name ?? detail?.conversation.title ?? "Conversation Workspace"}</h2><p className="lede">Messages use the inbox-specific WABA and token stored in PostgreSQL via Prisma.</p></div><span className="badge">{detail?.inbox?.name ?? "No inbox selected"}</span></section>
            <section className="grid">
              <aside className="panel">
                <div className="panel-header"><h3>Conversations</h3><span>{conversations.length}</span></div>
                <div className="conversation-list">
                  {conversations.map((conversation) => (
                    <button key={conversation.id} className={`conversation-card ${selectedConversationId === conversation.id ? "active" : ""}`} onClick={() => setSelectedConversationId(conversation.id)}>
                      <strong>{conversation.title}</strong>
                      <span>{conversation.lastMessagePreview}</span>
                      <small>{conversation.inbox?.name ?? "Unassigned"} | {conversation.unreadCount} unread</small>
                    </button>
                  ))}
                  {!conversations.length && <p className="empty">No conversations yet. Finish inbox setup and connect webhooks.</p>}
                </div>
              </aside>
              <article className="panel timeline">
                <div className="panel-header"><h3>Timeline</h3><span>{detail?.messages.length ?? 0} events</span></div>
                <div className="message-list">
                  {detail?.messages.map((message) => (
                    <div key={message.id} className={`bubble ${message.direction}`}>
                      <small>{message.direction} | {new Date(message.timestamp).toLocaleString()}</small>
                      <strong>{message.text ?? `[${message.type}]`}</strong>
                      {message.status && <small>Status: {message.status}</small>}
                    </div>
                  ))}
                  {!detail?.messages.length && <p className="empty">No messages yet for this conversation.</p>}
                </div>
                <form className="composer" onSubmit={sendMessage}>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Send a WhatsApp text message" />
                  <button type="submit">Send</button>
                </form>
              </article>
            </section>
          </>
        )}

        {(error || success) && <div className={error ? "error-banner" : "success-banner"}>{error || success}</div>}
      </main>
    </div>
  );
}
