import { type FormEvent, useRef, useEffect } from "react";
import type { Conversation, ConversationDetail, Message } from "../types";

interface InboxPageProps {
  conversations: Array<Conversation & { inbox?: { name: string } }>;
  selectedConversationId: string;
  onSelectConversation: (id: string) => void;
  detail: ConversationDetail | null;
  draft: string;
  onDraftChange: (v: string) => void;
  onSendMessage: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(ts: string) {
  try {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function BubbleGroup({ messages }: { messages: Message[] }) {
  let lastDate = "";
  return (
    <>
      {messages.map((msg) => {
        const date = formatDate(msg.timestamp);
        const showDate = date !== lastDate;
        lastDate = date;
        return (
          <div key={msg.id}>
            {showDate && (
              <div className="date-divider"><span>{date}</span></div>
            )}
            {msg.direction === "status" ? (
              <div className="status-event">
                <span>{msg.text ?? msg.type}</span>
                {msg.status && <span className="status-event__tag">{msg.status}</span>}
              </div>
            ) : (
              <div className={`bubble bubble--${msg.direction}`}>
                <p className="bubble__text">{msg.text ?? <em className="bubble__media">[{msg.type}]</em>}</p>
                <span className="bubble__meta">
                  {formatTime(msg.timestamp)}
                  {msg.direction === "outgoing" && (
                    <span className="bubble__tick" title={msg.status}>
                      {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function InboxPage({
  conversations,
  selectedConversationId,
  onSelectConversation,
  detail,
  draft,
  onDraftChange,
  onSendMessage,
}: InboxPageProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  const contactName = detail?.contact?.name ?? detail?.conversation.title ?? "Conversation";

  return (
    <div className="inbox-shell">
      {/* Conversation list */}
      <div className="convo-panel">
        <div className="convo-panel__header">
          <h2>Conversations</h2>
          <span className="count-badge">{conversations.length}</span>
        </div>
        <div className="convo-list">
          {conversations.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">💬</span>
              <p>No conversations yet.</p>
              <small>Finish inbox setup and connect webhooks.</small>
            </div>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`convo-item ${selectedConversationId === conv.id ? "convo-item--active" : ""}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="avatar avatar--md">{initials(conv.title)}</div>
              <div className="convo-item__body">
                <div className="convo-item__header">
                  <strong className="convo-item__name">{conv.title}</strong>
                  {conv.unreadCount > 0 && (
                    <span className="unread-badge">{conv.unreadCount}</span>
                  )}
                </div>
                <p className="convo-item__preview">{conv.lastMessagePreview || "No messages yet"}</p>
                <small className="convo-item__sub">{conv.inbox?.name ?? "Unassigned"}</small>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="chat-panel">
        {/* Chat header */}
        {detail ? (
          <div className="chat-header">
            <div className="avatar avatar--md">{initials(contactName)}</div>
            <div className="chat-header__info">
              <strong>{contactName}</strong>
              <small>{detail.inbox?.name ?? "Inbox"} · {detail.inbox?.phoneNumber ?? ""}</small>
            </div>
            <div className="chat-header__actions">
              {detail.assignee && (
                <span className="meta-chip">
                  👤 {detail.assignee.name}
                </span>
              )}
              {detail.labels?.map((lbl) => (
                <span key={lbl.id} className="meta-chip meta-chip--label" style={{ borderColor: lbl.color }}>
                  {lbl.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-header chat-header--empty">
            <span>Select a conversation</span>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {detail?.messages && detail.messages.length > 0 ? (
            <>
              <BubbleGroup messages={detail.messages} />
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="empty-state empty-state--centered">
              <span className="empty-state__icon">💬</span>
              <p>{detail ? "No messages in this conversation." : "Select a conversation to view messages."}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {detail?.notes && detail.notes.length > 0 && (
          <div className="notes-bar">
            {detail.notes.map((note) => (
              <div key={note.id} className="note-chip">
                <strong>{note.author.name}:</strong> {note.content}
              </div>
            ))}
          </div>
        )}

        {/* Composer */}
        <form className="composer" onSubmit={onSendMessage}>
          <textarea
            className="composer__input"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Type a message…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSendMessage(e as unknown as FormEvent<HTMLFormElement>);
              }
            }}
          />
          <button
            type="submit"
            className="composer__send"
            disabled={!draft.trim() || !selectedConversationId}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
