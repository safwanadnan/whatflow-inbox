import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type MetaConfig = {
  accessToken: string;
  verifyToken: string;
  graphBaseUrl: string;
  graphVersion: string;
  wabaId: string;
  phoneNumberId: string;
};

export type AdminMetaAppConfig = {
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

export type WorkspaceAccount = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type InboxConnectionType = "embedded" | "manual";

export type Inbox = {
  id: string;
  accountId: string;
  name: string;
  connectionType: InboxConnectionType;
  status: "draft" | "connected";
  phoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  verifyToken: string;
  metaAppId?: string;
  createdAt: string;
};

export type Contact = {
  id: string;
  waId: string;
  name: string;
  profileName?: string;
};

export type MessageDirection = "incoming" | "outgoing" | "status";

export type TimelineMessage = {
  id: string;
  conversationId: string;
  waId: string;
  inboxId: string;
  type: string;
  direction: MessageDirection;
  text?: string;
  raw: unknown;
  timestamp: string;
  status?: string;
};

export type Conversation = {
  id: string;
  inboxId: string;
  waId: string;
  title: string;
  phoneNumberId?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  contactId: string;
  status: "open" | "resolved";
};

export type StoreShape = {
  config: {
    meta: MetaConfig;
    adminMetaApp: AdminMetaAppConfig;
  };
  accounts: WorkspaceAccount[];
  inboxes: Inbox[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: TimelineMessage[];
};

const currentFile = fileURLToPath(import.meta.url);
const storePath = resolve(dirname(currentFile), "../data/store.json");

const defaultMetaConfig = (): MetaConfig => ({
  accessToken: process.env.META_ACCESS_TOKEN ?? "",
  verifyToken: process.env.META_VERIFY_TOKEN ?? "",
  graphBaseUrl: process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com",
  graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
  wabaId: process.env.META_WABA_ID ?? "",
  phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? "",
});

const defaultAdminMetaApp = (): AdminMetaAppConfig => ({
  embeddedSignupEnabled: false,
  appId: "",
  appSecret: "",
  configurationId: "",
  verifyToken: process.env.META_VERIFY_TOKEN ?? "",
  systemUserAccessToken: process.env.META_ACCESS_TOKEN ?? "",
  graphBaseUrl: process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com",
  graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
  webhookCallbackUrl: "",
});

const defaultStore = (): StoreShape => ({
  config: {
    meta: defaultMetaConfig(),
    adminMetaApp: defaultAdminMetaApp(),
  },
  accounts: [
    {
      id: "acct-default",
      name: "Default Account",
      slug: "default-account",
      createdAt: new Date().toISOString(),
    },
  ],
  inboxes: [],
  contacts: [],
  conversations: [],
  messages: [],
});

function ensureStore() {
  mkdirSync(dirname(storePath), { recursive: true });
  try {
    readFileSync(storePath, "utf-8");
  } catch {
    writeFileSync(storePath, JSON.stringify(defaultStore(), null, 2));
  }
}

function normalizeStore(raw: Partial<StoreShape>): StoreShape {
  const defaults = defaultStore();
  return {
    config: {
      meta: {
        ...defaults.config.meta,
        ...(raw.config?.meta ?? {}),
      },
      adminMetaApp: {
        ...defaults.config.adminMetaApp,
        ...(raw.config?.adminMetaApp ?? {}),
      },
    },
    accounts: raw.accounts?.length ? raw.accounts : defaults.accounts,
    inboxes: (raw.inboxes ?? []).map((inbox) => ({
      createdAt: new Date().toISOString(),
      metaAppId: "",
      ...inbox,
    })),
    contacts: raw.contacts ?? [],
    conversations: (raw.conversations ?? []).map((conversation) => ({
      inboxId: (conversation as Partial<Conversation>).inboxId ?? "",
      ...conversation,
    })),
    messages: (raw.messages ?? []).map((message) => ({
      inboxId: (message as Partial<TimelineMessage>).inboxId ?? "",
      ...message,
    })),
  };
}

export function readStore(): StoreShape {
  ensureStore();
  const parsed = JSON.parse(readFileSync(storePath, "utf-8")) as Partial<StoreShape>;
  return normalizeStore(parsed);
}

export function writeStore(next: StoreShape) {
  ensureStore();
  writeFileSync(storePath, JSON.stringify(next, null, 2));
}

export function updateStore<T>(updater: (current: StoreShape) => T): T {
  const current = readStore();
  const result = updater(current);
  writeStore(current);
  return result;
}
