import type { Account, Viewer, View } from "../types";

interface SidebarProps {
  viewer: Viewer;
  view: View;
  onViewChange: (v: View) => void;
  accounts: Account[];
  onLogout: () => void;
  conversationCount: number;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const NAV_ITEMS: { key: View; label: string; sub: string; icon: string }[] = [
  { key: "inbox", label: "Inbox", sub: "Conversations", icon: "💬" },
  { key: "setup", label: "Create Inbox", sub: "Connect WhatsApp", icon: "➕" },
  { key: "admin", label: "Admin", sub: "Meta app & agents", icon: "⚙️" },
];

export function Sidebar({ viewer, view, onViewChange, accounts, onLogout, conversationCount }: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar__brand">
        <div className="brand-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="22" height="22">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.12 1.527 5.855L0 24l6.335-1.527A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.806 9.806 0 01-5.006-1.364l-.36-.214-3.757.906.952-3.656-.235-.374A9.818 9.818 0 012.182 12C2.182 6.579 6.58 2.182 12 2.182c5.42 0 9.818 4.397 9.818 9.818 0 5.42-4.397 9.818-9.818 9.818z"/>
          </svg>
        </div>
        <div>
          <span className="brand-name">Whatflow</span>
          <span className="brand-tagline">WhatsApp Inbox</span>
        </div>
      </div>

      {/* User */}
      <div className="sidebar__user">
        <div className="avatar avatar--md">{initials(viewer.name)}</div>
        <div className="sidebar__user-info">
          <strong>{viewer.name}</strong>
          <small>{viewer.email}</small>
        </div>
        <button className="icon-btn" onClick={onLogout} title="Sign out" aria-label="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${view === item.key ? "nav-item--active" : ""}`}
            onClick={() => onViewChange(item.key)}
          >
            <span className="nav-item__icon">{item.icon}</span>
            <span className="nav-item__text">
              <strong>{item.label}</strong>
              {item.key === "inbox"
                ? <small>{conversationCount} conversations</small>
                : <small>{item.sub}</small>
              }
            </span>
            {item.key === "inbox" && conversationCount > 0 && (
              <span className="nav-item__badge">{conversationCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Accounts */}
      {accounts.length > 0 && (
        <div className="sidebar__accounts">
          <p className="sidebar__section-label">Accounts</p>
          {accounts.map((account) => (
            <div key={account.id} className="account-pill">
              <div className="avatar avatar--sm">{initials(account.name)}</div>
              <div>
                <strong>{account.name}</strong>
                <small>{account.agents.length} agent{account.agents.length !== 1 ? "s" : ""}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role badge */}
      <div className="sidebar__footer">
        <span className="role-badge">{viewer.type}</span>
        <span className="role-badge role-badge--muted">{viewer.role}</span>
      </div>
    </aside>
  );
}
