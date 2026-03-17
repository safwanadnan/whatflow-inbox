import { prisma } from "./db.js";

export type MetaConfig = {
  accessToken: string;
  verifyToken: string;
  graphBaseUrl: string;
  graphVersion: string;
  wabaId: string;
  phoneNumberId: string;
};

type MetaRequestOptions = {
  path: string;
  method?: string;
  query?: URLSearchParams;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  config?: MetaConfig;
};

export async function getMetaConfig() {
  const config = await prisma.globalMetaConfig.findUniqueOrThrow({ where: { id: "singleton" } });
  return {
    accessToken: config.accessToken,
    verifyToken: config.verifyToken,
    graphBaseUrl: config.graphBaseUrl,
    graphVersion: config.graphVersion,
    wabaId: config.wabaId,
    phoneNumberId: config.phoneNumberId,
  };
}

export async function getAdminMetaAppConfig() {
  return prisma.adminMetaAppConfig.findUniqueOrThrow({ where: { id: "singleton" } });
}

export async function getMetaConfigForInbox(inboxId?: string): Promise<MetaConfig> {
  const fallback = await getMetaConfig();
  if (!inboxId) return fallback;

  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox) return fallback;

  return {
    accessToken: inbox.accessToken || fallback.accessToken,
    verifyToken: inbox.verifyToken || fallback.verifyToken,
    graphBaseUrl: fallback.graphBaseUrl,
    graphVersion: fallback.graphVersion,
    wabaId: inbox.businessAccountId || fallback.wabaId,
    phoneNumberId: inbox.phoneNumberId || fallback.phoneNumberId,
  };
}

export async function exchangeEmbeddedSignupCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const admin = await getAdminMetaAppConfig();

  if (!admin.appId || !admin.appSecret) {
    throw new Error("Admin Meta app credentials are not configured.");
  }

  const response = await fetch(`${admin.graphBaseUrl}/${admin.graphVersion}/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: admin.appId,
      client_secret: admin.appSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  return payload as { access_token?: string; token_type?: string };
}

export async function metaRequest({
  path,
  method = "GET",
  query,
  headers = {},
  body = null,
  config,
}: MetaRequestOptions) {
  const meta = config ?? (await getMetaConfig());

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
