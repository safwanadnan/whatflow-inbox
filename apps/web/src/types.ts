export type Agent = {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "agent";
};

export type Label = { id: string; name: string; color: string };

export type CannedResponse = { id: string; title: string; content: string };

export type Account = {
  id: string;
  name: string;
  slug: string;
  agents: Agent[];
  labels: Label[];
  cannedResponses: CannedResponse[];
};

export type Inbox = {
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

export type Conversation = {
  id: string;
  inboxId: string;
  title: string;
  lastMessagePreview: string;
  unreadCount: number;
  inbox?: Inbox;
};

export type Message = {
  id: string;
  type: string;
  direction: "incoming" | "outgoing" | "status";
  text?: string;
  timestamp: string;
  status?: string;
};

export type Note = { id: string; content: string; author: { name: string } };

export type ConversationDetail = {
  conversation: Conversation;
  inbox?: Inbox;
  contact?: { name: string };
  messages: Message[];
  notes?: Note[];
  labels?: Label[];
  assignee?: { id: string; name: string } | null;
};

export type AdminMetaApp = {
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

export type Bootstrap = {
  adminMetaApp: AdminMetaApp;
  accounts: Account[];
  inboxes: Inbox[];
  conversations: Array<Conversation & { inbox?: Inbox }>;
};

export type Viewer = {
  sub: string;
  type: "platform" | "agent";
  role: string;
  accountId?: string;
  email: string;
  name: string;
};

export type SetupStatus = {
  isInitialized: boolean;
  requiresBootstrap: boolean;
  allowFirstUserSignup: boolean;
  seededFromEnv: boolean;
};

export type View = "setup" | "admin" | "inbox";

export const defaultAdmin: AdminMetaApp = {
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
