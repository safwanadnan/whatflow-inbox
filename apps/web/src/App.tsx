import "./styles.css";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, authTokenKey } from "./api";
import type { Account, AdminMetaApp, Conversation, ConversationDetail, Inbox, SetupStatus, Viewer, View } from "./types";
import { defaultAdmin } from "./types";
import { AuthPage } from "./components/AuthPage";
import { Sidebar } from "./components/Sidebar";
import { InboxPage } from "./components/InboxPage";
import { SetupPage } from "./components/SetupPage";
import { AdminPage } from "./components/AdminPage";
import { Toast } from "./components/Toast";

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export default function App() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [view, setView] = useState<View>("inbox");
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
  const [agentForm, setAgentForm] = useState({ accountId: "", name: "", email: "", password: "", role: "agent" });
  const [setupForm, setSetupForm] = useState({
    accountId: "", name: "", phoneNumber: "", phoneNumberId: "", businessAccountId: "", accessToken: "", verifyToken: "",
  });

  async function loadBootstrap() {
    const data = await api.fetchBootstrap();
    setAccounts(data.accounts);
    setInboxes(data.inboxes);
    setConversations(data.conversations);
    setAdminMetaApp({ ...defaultAdmin, ...data.adminMetaApp, appSecret: "", systemUserAccessToken: "" });
    const firstAccount = data.accounts[0]?.id ?? "";
    setSetupForm((cur) => ({ ...cur, accountId: cur.accountId || firstAccount }));
    setAgentForm((cur) => ({ ...cur, accountId: cur.accountId || firstAccount }));
    if (!selectedConversationId && data.conversations[0]) setSelectedConversationId(data.conversations[0].id);
  }

  async function loadConversation(id: string) {
    setDetail(await api.fetchConversation(id));
  }

  async function restoreSession() {
    const status = await api.fetchSetupStatus();
    setSetupStatus(status);
    if (!status.isInitialized) return;
    const token = localStorage.getItem(authTokenKey);
    if (!token) return;
    try {
      const data = await api.fetchMe();
      setViewer(data.user);
      await loadBootstrap();
    } catch {
      localStorage.removeItem(authTokenKey);
    }
  }

  useEffect(() => {
    void restoreSession().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (selectedConversationId) void loadConversation(selectedConversationId).catch((err: Error) => setError(err.message));
  }, [selectedConversationId]);

  useEffect(() => {
    window.fbAsyncInit = function () {
      if (!window.FB || !adminMetaApp.appId) return;
      window.FB.init({ appId: adminMetaApp.appId, autoLogAppEvents: true, xfbml: true, version: adminMetaApp.graphVersion || "v25.0" });
      setFbLoaded(true);
    };
    const script = document.createElement("script");
    script.async = true; script.defer = true; script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    document.body.appendChild(script);
    const onMessage = (event: MessageEvent<string>) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = JSON.parse(event.data) as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          setSessionInfo(JSON.stringify(data, null, 2));
          if (data.event === "FINISH") {
            setSetupForm((cur) => ({ ...cur, phoneNumberId: data.data?.phone_number_id ?? cur.phoneNumberId, businessAccountId: data.data?.waba_id ?? cur.businessAccountId }));
          }
        }
      } catch { return; }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); script.remove(); };
  }, [adminMetaApp.appId, adminMetaApp.graphVersion]);

  async function handleLogin(email: string, password: string, accountId: string) {
    setError(""); setSuccess("");
    const data = await api.login(email, password, accountId);
    localStorage.setItem(authTokenKey, data.token);
    setViewer(data.actor);
    await loadBootstrap();
    setSuccess("Logged in successfully.");
  }

  async function handleBootstrap(name: string, email: string, password: string) {
    setError(""); setSuccess("");
    const data = await api.bootstrapSystem(name, email, password);
    localStorage.setItem(authTokenKey, data.token);
    setViewer(data.actor);
    const status = await api.fetchSetupStatus();
    setSetupStatus(status);
    await loadBootstrap();
    setSuccess("Super admin created.");
  }

  function logout() {
    localStorage.removeItem(authTokenKey);
    setViewer(null); setAccounts([]); setInboxes([]); setConversations([]); setDetail(null);
  }

  async function saveAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setSuccess("");
    await api.saveAdminMeta(adminMetaApp);
    await loadBootstrap();
    setSuccess("Admin Meta settings saved.");
  }

  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!newAccountName.trim()) return; setError(""); setSuccess("");
    await api.createAccount(newAccountName);
    setNewAccountName(""); await loadBootstrap(); setSuccess("Account created.");
  }

  async function createAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setSuccess("");
    await api.createAgent(agentForm.accountId, agentForm);
    setAgentForm((cur) => ({ ...cur, name: "", email: "", password: "", role: "agent" }));
    await loadBootstrap(); setSuccess("Agent created.");
  }

  async function createManualInbox(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setSuccess("");
    await api.createManualInbox(setupForm);
    await loadBootstrap(); setSuccess("Manual inbox created.");
  }

  function launchEmbeddedSignup() {
    if (!window.FB || !adminMetaApp.configurationId) { setError("Facebook SDK or Meta configuration ID is missing."); return; }
    window.FB.login(
      (response) => setEmbeddedCode(response.authResponse?.code ?? ""),
      { config_id: adminMetaApp.configurationId, response_type: "code", override_default_response_type: true, extras: { version: "v3", sessionInfoVersion: "3", setup: { business: { id: null, phone: {}, address: {}, timezone: null }, phone: { category: null, description: "" } } } }
    );
  }

  async function finishEmbeddedSignup() {
    setError(""); setSuccess("");
    await api.finishEmbeddedSignup({
      accountId: setupForm.accountId, name: setupForm.name, phoneNumber: setupForm.phoneNumber,
      phoneNumberId: setupForm.phoneNumberId, wabaId: setupForm.businessAccountId,
      code: embeddedCode, redirectUri: adminMetaApp.webhookCallbackUrl || window.location.origin,
    });
    await loadBootstrap(); setSuccess("Embedded signup inbox created."); setView("inbox");
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!selectedConversationId || !draft.trim()) return; setError(""); setSuccess("");
    await api.sendMessage(selectedConversationId, draft);
    setDraft(""); await loadConversation(selectedConversationId); await loadBootstrap();
  }

  const dismissToast = useCallback(() => { setError(""); setSuccess(""); }, []);

  const wrapAsync = (fn: () => Promise<void>) => {
    return fn().catch((err: Error) => setError(err.message));
  };

  // Auth screens (no sidebar)
  if (!setupStatus || setupStatus.requiresBootstrap || !viewer) {
    return (
      <>
        <AuthPage
          setupStatus={setupStatus}
          onLogin={(email, pass, accountId) => wrapAsync(() => handleLogin(email, pass, accountId))}
          onBootstrap={(name, email, pass) => wrapAsync(() => handleBootstrap(name, email, pass))}
          error={error}
        />
        <Toast message={success} type="success" onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        viewer={viewer}
        view={view}
        onViewChange={setView}
        accounts={accounts}
        onLogout={logout}
        conversationCount={conversations.length}
      />

      <main className="app-main">
        {view === "inbox" && (
          <InboxPage
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            detail={detail}
            draft={draft}
            onDraftChange={setDraft}
            onSendMessage={(e) => wrapAsync(() => sendMessage(e))}
          />
        )}

        {view === "setup" && (
          <SetupPage
            accounts={accounts}
            inboxes={inboxes}
            adminMetaApp={adminMetaApp}
            onCreateManual={(e) => wrapAsync(() => createManualInbox(e))}
            onFinishEmbedded={() => wrapAsync(finishEmbeddedSignup)}
            setupForm={setupForm}
            onSetupFormChange={setSetupForm}
            embeddedCode={embeddedCode}
            onEmbeddedCodeChange={setEmbeddedCode}
            sessionInfo={sessionInfo}
            fbLoaded={fbLoaded}
            onLaunchEmbedded={launchEmbeddedSignup}
          />
        )}

        {view === "admin" && (
          <AdminPage
            adminMetaApp={adminMetaApp}
            onAdminMetaChange={setAdminMetaApp}
            onSaveAdmin={(e) => wrapAsync(() => saveAdmin(e))}
            accounts={accounts}
            onCreateAccount={(e) => wrapAsync(() => createAccount(e))}
            onCreateAgent={(e) => wrapAsync(() => createAgent(e))}
            newAccountName={newAccountName}
            onNewAccountNameChange={setNewAccountName}
            agentForm={agentForm}
            onAgentFormChange={setAgentForm}
          />
        )}
      </main>

      <Toast message={error} type="error" onDismiss={dismissToast} />
      <Toast message={success} type="success" onDismiss={dismissToast} />
    </div>
  );
}
