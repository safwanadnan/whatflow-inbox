import { Inbox, MetaConfig, readStore } from "./store.js";

type MetaRequestOptions = {
  path: string;
  method?: string;
  query?: URLSearchParams;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  config?: MetaConfig;
};

function configFromInbox(inbox: Inbox, fallback: MetaConfig): MetaConfig {
  return {
    accessToken: inbox.accessToken || fallback.accessToken,
    verifyToken: inbox.verifyToken || fallback.verifyToken,
    graphBaseUrl: fallback.graphBaseUrl,
    graphVersion: fallback.graphVersion,
    wabaId: inbox.businessAccountId || fallback.wabaId,
    phoneNumberId: inbox.phoneNumberId || fallback.phoneNumberId,
  };
}

export function getMetaConfig() {
  return readStore().config.meta;
}

export function getAdminMetaAppConfig() {
  return readStore().config.adminMetaApp;
}

export function getMetaConfigForInbox(inboxId?: string): MetaConfig {
  const store = readStore();
  const fallback = store.config.meta;
  if (!inboxId) return fallback;
  const inbox = store.inboxes.find((item) => item.id === inboxId);
  return inbox ? configFromInbox(inbox, fallback) : fallback;
}

export async function metaRequest({
  path,
  method = "GET",
  query,
  headers = {},
  body = null,
  config,
}: MetaRequestOptions) {
  const meta = config ?? getMetaConfig();

  if (!meta.accessToken) {
    throw new Error("Meta access token is not configured.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${meta.graphBaseUrl}${normalizedPath}`);
  if (query) {
    query.forEach((value, key) => url.searchParams.set(key, value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      ...headers,
    },
    body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  return payload;
}
