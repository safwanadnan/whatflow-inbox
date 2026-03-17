import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type Conversation = {
  id: string;
  title: string;
  waId: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  status: "open" | "resolved";
};

type Message = {
  id: string;
  type: string;
  direction: "incoming" | "outgoing" | "status";
  text?: string;
  timestamp: string;
  status?: string;
};

type ConversationDetail = {
  conversation: Conversation;
  contact?: {
    name: string;
  };
  messages: Message[];
};

type MetaConfig = {
  accessToken: string;
  verifyToken: string;
  graphBaseUrl: string;
  graphVersion: string;
  wabaId: string;
  phoneNumberId: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [metaConfig, setMetaConfig] = useState<MetaConfig>({
    accessToken: "",
    verifyToken: "",
    graphBaseUrl: "https://graph.facebook.com",
    graphVersion: "v23.0",
    wabaId: "",
    phoneNumberId: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadConversations() {
    const data = await request<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
    if (!selectedId && data.conversations[0]) {
      setSelectedId(data.conversations[0].id);
    }
  }

  async function loadConversation(id: string) {
    const data = await request<ConversationDetail>(`/api/conversations/${id}`);
    setDetail(data);
  }

  async function loadMetaViews() {
    const config = await request<MetaConfig>("/api/config/meta");
    setMetaConfig((current) => ({ ...current, ...config, accessToken: "" }));

    try {
      const templatesData = await request<{ data?: any[] }>("/api/resources/templates");
      setTemplates(templatesData.data ?? []);
    } catch {
      setTemplates([]);
    }

    try {
      const numbersData = await request<{ data?: any[] }>("/api/resources/phone-numbers");
      setPhoneNumbers(numbersData.data ?? []);
    } catch {
      setPhoneNumbers([]);
    }
  }

  useEffect(() => {
    void loadConversations().catch((err: Error) => setError(err.message));
    void loadMetaViews().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadConversation(selectedId).catch((err: Error) => setError(err.message));
  }, [selectedId]);

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await request("/api/config/meta", {
        method: "PUT",
        body: JSON.stringify(metaConfig),
      });
      await loadMetaViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setError("");
    try {
      await request(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: draft }),
      });
      setDraft("");
      await loadConversation(selectedId);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Self-hostable WhatsApp Inbox</p>
          <h1>Whatflow</h1>
          <p className="lede">
            Chatwoot-style conversation workspace for Meta Cloud API, narrowed to WhatsApp.
          </p>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Conversations</h2>
            <span>{conversations.length}</span>
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-card ${selectedId === conversation.id ? "active" : ""}`}
                onClick={() => setSelectedId(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <span>{conversation.lastMessagePreview}</span>
                <small>
                  {new Date(conversation.lastMessageAt).toLocaleString()} · {conversation.unreadCount} unread
                </small>
              </button>
            ))}
            {!conversations.length && <p className="empty">Incoming webhooks will start filling this inbox.</p>}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <section className="hero panel">
          <div>
            <p className="eyebrow">Operator View</p>
            <h2>{detail?.contact?.name ?? detail?.conversation.title ?? "Choose a conversation"}</h2>
            <p className="lede">
              Keep the opinionated inbox for daily work, and use the raw proxy for edge Meta features until the UI catches up.
            </p>
          </div>
          <a className="ghost-link" href={`${apiBaseUrl}/api/meta/${metaConfig.graphVersion}`}>
            Raw API base
          </a>
        </section>

        <section className="grid">
          <article className="panel timeline">
            <div className="panel-header">
              <h3>Timeline</h3>
              <span>{detail?.messages.length ?? 0} events</span>
            </div>
            <div className="message-list">
              {detail?.messages.map((message) => (
                <div key={message.id} className={`bubble ${message.direction}`}>
                  <small>
                    {message.direction} · {new Date(message.timestamp).toLocaleString()}
                  </small>
                  <strong>{message.text ?? `[${message.type}]`}</strong>
                  {message.status && <small>Status: {message.status}</small>}
                </div>
              ))}
              {!detail?.messages.length && <p className="empty">No messages yet for this conversation.</p>}
            </div>
            <form className="composer" onSubmit={handleSendMessage}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Send a WhatsApp text message through the Cloud API"
              />
              <button type="submit">Send</button>
            </form>
          </article>

          <aside className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Meta Setup</h3>
                <span>Cloud API</span>
              </div>
              <form className="config-form" onSubmit={handleSaveConfig}>
                <label>
                  Graph Version
                  <input
                    value={metaConfig.graphVersion}
                    onChange={(event) => setMetaConfig({ ...metaConfig, graphVersion: event.target.value })}
                  />
                </label>
                <label>
                  WABA ID
                  <input
                    value={metaConfig.wabaId}
                    onChange={(event) => setMetaConfig({ ...metaConfig, wabaId: event.target.value })}
                  />
                </label>
                <label>
                  Phone Number ID
                  <input
                    value={metaConfig.phoneNumberId}
                    onChange={(event) => setMetaConfig({ ...metaConfig, phoneNumberId: event.target.value })}
                  />
                </label>
                <label>
                  Verify Token
                  <input
                    value={metaConfig.verifyToken}
                    onChange={(event) => setMetaConfig({ ...metaConfig, verifyToken: event.target.value })}
                  />
                </label>
                <label>
                  Access Token
                  <input
                    type="password"
                    value={metaConfig.accessToken}
                    onChange={(event) => setMetaConfig({ ...metaConfig, accessToken: event.target.value })}
                    placeholder="Paste only when rotating"
                  />
                </label>
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Configuration"}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Phone Numbers</h3>
                <span>{phoneNumbers.length}</span>
              </div>
              <div className="token-list">
                {phoneNumbers.map((number) => (
                  <div key={number.id} className="token">
                    <strong>{number.display_phone_number ?? number.id}</strong>
                    <span>{number.verified_name ?? "Unverified name"}</span>
                    <small>{number.status ?? "unknown"} · {number.quality_rating ?? "no quality rating"}</small>
                  </div>
                ))}
                {!phoneNumbers.length && <p className="empty">Save your Meta config to load phone numbers.</p>}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Templates</h3>
                <span>{templates.length}</span>
              </div>
              <div className="token-list">
                {templates.slice(0, 8).map((template) => (
                  <div key={template.id ?? template.name} className="token">
                    <strong>{template.name}</strong>
                    <span>{template.category}</span>
                    <small>{template.language ?? template.status ?? "template"}</small>
                  </div>
                ))}
                {!templates.length && <p className="empty">Templates will appear once WABA access is configured.</p>}
              </div>
            </section>
          </aside>
        </section>

        {error && <div className="error-banner">{error}</div>}
      </main>
    </div>
  );
}
