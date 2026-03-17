import "dotenv/config";
import cors from "cors";
import express from "express";
import { prisma, ensureBootstrapData } from "./db.js";
import {
  exchangeEmbeddedSignupCode,
  getAdminMetaAppConfig,
  getMetaConfig,
  getMetaConfigForInbox,
  metaRequest,
} from "./meta.js";
import { ingestWebhookPayload } from "./webhook.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
type AgentRoleInput = "admin" | "manager" | "agent";

app.use(cors({ origin: process.env.APP_URL?.split(",") ?? true }));
app.use("/api/meta", express.raw({ type: "*/*", limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));

function redactAdminConfig(config: Awaited<ReturnType<typeof getAdminMetaAppConfig>>) {
  return {
    ...config,
    appSecret: config.appSecret ? "saved" : "",
    systemUserAccessToken: config.systemUserAccessToken ? "saved" : "",
  };
}

function redactInbox<T extends { accessToken: string; verifyToken: string }>(inbox: T) {
  return {
    ...inbox,
    accessToken: inbox.accessToken ? "saved" : "",
    verifyToken: inbox.verifyToken ? "saved" : "",
  };
}

app.get("/api/health", async (_req, res) => {
  await ensureBootstrapData();
  res.json({ ok: true, service: "whatflow-api" });
});

app.get("/api/bootstrap", async (_req, res) => {
  await ensureBootstrapData();
  const [adminMetaApp, accounts, inboxes, conversations] = await Promise.all([
    getAdminMetaAppConfig(),
    prisma.account.findMany({
      orderBy: { createdAt: "asc" },
      include: { agents: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.inbox.findMany({
      orderBy: { createdAt: "desc" },
      include: { account: true },
    }),
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      include: { inbox: true, contact: true },
    }),
  ]);

  res.json({
    adminMetaApp: redactAdminConfig(adminMetaApp),
    accounts,
    inboxes: inboxes.map(redactInbox),
    conversations,
  });
});

app.get("/api/admin/meta-app", async (_req, res) => {
  const config = await getAdminMetaAppConfig();
  res.json(redactAdminConfig(config));
});

app.put("/api/admin/meta-app", async (req, res) => {
  const payload = req.body ?? {};
  const config = await prisma.adminMetaAppConfig.upsert({
    where: { id: "singleton" },
    update: {
      embeddedSignupEnabled: payload.embeddedSignupEnabled ?? undefined,
      appId: payload.appId ?? undefined,
      appSecret: payload.appSecret || undefined,
      configurationId: payload.configurationId ?? undefined,
      verifyToken: payload.verifyToken ?? undefined,
      systemUserAccessToken: payload.systemUserAccessToken || undefined,
      graphBaseUrl: payload.graphBaseUrl ?? undefined,
      graphVersion: payload.graphVersion ?? undefined,
      webhookCallbackUrl: payload.webhookCallbackUrl ?? undefined,
    },
    create: {
      id: "singleton",
      embeddedSignupEnabled: Boolean(payload.embeddedSignupEnabled),
      appId: String(payload.appId ?? ""),
      appSecret: String(payload.appSecret ?? ""),
      configurationId: String(payload.configurationId ?? ""),
      verifyToken: String(payload.verifyToken ?? ""),
      systemUserAccessToken: String(payload.systemUserAccessToken ?? ""),
      graphBaseUrl: String(payload.graphBaseUrl ?? "https://graph.facebook.com"),
      graphVersion: String(payload.graphVersion ?? "v23.0"),
      webhookCallbackUrl: String(payload.webhookCallbackUrl ?? ""),
    },
  });

  res.json({ success: true, config: redactAdminConfig(config) });
});

app.get("/api/config/meta", async (_req, res) => {
  const meta = await getMetaConfig();
  res.json({
    ...meta,
    accessToken: meta.accessToken ? `${meta.accessToken.slice(0, 8)}...` : "",
  });
});

app.put("/api/config/meta", async (req, res) => {
  const payload = req.body ?? {};
  const meta = await prisma.globalMetaConfig.upsert({
    where: { id: "singleton" },
    update: {
      accessToken: payload.accessToken || undefined,
      verifyToken: payload.verifyToken ?? undefined,
      graphBaseUrl: payload.graphBaseUrl ?? undefined,
      graphVersion: payload.graphVersion ?? undefined,
      wabaId: payload.wabaId ?? undefined,
      phoneNumberId: payload.phoneNumberId ?? undefined,
    },
    create: {
      id: "singleton",
      accessToken: String(payload.accessToken ?? ""),
      verifyToken: String(payload.verifyToken ?? ""),
      graphBaseUrl: String(payload.graphBaseUrl ?? "https://graph.facebook.com"),
      graphVersion: String(payload.graphVersion ?? "v23.0"),
      wabaId: String(payload.wabaId ?? ""),
      phoneNumberId: String(payload.phoneNumberId ?? ""),
    },
  });

  res.json({ success: true, meta: { ...meta, accessToken: meta.accessToken ? "saved" : "" } });
});

app.get("/api/accounts", async (_req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    include: { agents: { orderBy: { createdAt: "asc" } }, inboxes: true },
  });
  res.json({ accounts });
});

app.post("/api/accounts", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    return res.status(400).json({ error: "Account name is required." });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `account-${Date.now()}`;

  const account = await prisma.account.create({
    data: { name, slug },
  });

  return res.status(201).json({ account });
});

app.get("/api/accounts/:accountId/agents", async (req, res) => {
  const agents = await prisma.agent.findMany({
    where: { accountId: req.params.accountId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ agents });
});

app.post("/api/accounts/:accountId/agents", async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const role = String(req.body?.role ?? "agent") as AgentRoleInput;

  if (!name || !email) {
    return res.status(400).json({ error: "Agent name and email are required." });
  }

  const agent = await prisma.agent.create({
    data: {
      accountId: account.id,
      name,
      email,
      role: role === "admin" || role === "manager" ? role : "agent",
    },
  });

  return res.status(201).json({ agent });
});

app.get("/api/inboxes", async (_req, res) => {
  const inboxes = await prisma.inbox.findMany({
    orderBy: { createdAt: "desc" },
    include: { account: true },
  });
  res.json({ inboxes: inboxes.map(redactInbox) });
});

app.post("/api/inboxes", async (req, res) => {
  const payload = req.body ?? {};
  const name = String(payload.name ?? "").trim();
  const accountId = String(payload.accountId ?? "").trim();
  const connectionType = payload.connectionType === "embedded" ? "embedded" : "manual";

  if (!name || !accountId) {
    return res.status(400).json({ error: "Inbox name and account are required." });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  const adminConfig = await getAdminMetaAppConfig();
  if (connectionType === "embedded" && !adminConfig.embeddedSignupEnabled) {
    return res.status(400).json({ error: "Embedded signup has not been enabled by the admin yet." });
  }

  const inbox = await prisma.inbox.create({
    data: {
      accountId,
      name,
      connectionType,
      status: connectionType === "manual" ? "connected" : "draft",
      phoneNumber: String(payload.phoneNumber ?? ""),
      phoneNumberId: String(payload.phoneNumberId ?? ""),
      businessAccountId: String(payload.businessAccountId ?? ""),
      accessToken: String(payload.accessToken ?? ""),
      verifyToken: String(payload.verifyToken ?? (connectionType === "embedded" ? adminConfig.verifyToken : "")),
      metaAppId: connectionType === "embedded" ? adminConfig.appId : "",
    },
  });

  return res.status(201).json({
    inbox: redactInbox(inbox),
    setup: {
      webhookPath: `/webhooks/whatsapp/${inbox.id}`,
      embeddedSignupReady:
        connectionType === "embedded" && Boolean(adminConfig.appId && adminConfig.configurationId),
    },
  });
});

app.post("/api/inboxes/embedded/exchange", async (req, res) => {
  const accountId = String(req.body?.accountId ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
  const phoneNumberId = String(req.body?.phoneNumberId ?? "").trim();
  const businessAccountId = String(req.body?.wabaId ?? req.body?.businessAccountId ?? "").trim();
  const code = String(req.body?.code ?? "").trim();
  const redirectUri = String(req.body?.redirectUri ?? "").trim();

  if (!accountId || !name || !phoneNumberId || !businessAccountId || !code || !redirectUri) {
    return res.status(400).json({ error: "accountId, name, phoneNumberId, businessAccountId, code, and redirectUri are required." });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  const tokenResponse = await exchangeEmbeddedSignupCode({ code, redirectUri });
  const adminConfig = await getAdminMetaAppConfig();
  const accessToken = tokenResponse.access_token || adminConfig.systemUserAccessToken;

  if (!accessToken) {
    return res.status(400).json({ error: "No access token was returned from the Meta code exchange." });
  }

  const inbox = await prisma.inbox.create({
    data: {
      accountId,
      name,
      connectionType: "embedded",
      status: "connected",
      phoneNumber,
      phoneNumberId,
      businessAccountId,
      accessToken,
      verifyToken: adminConfig.verifyToken,
      metaAppId: adminConfig.appId,
    },
  });

  return res.status(201).json({
    inbox: redactInbox(inbox),
    tokenExchange: {
      tokenType: tokenResponse.token_type ?? "bearer",
      webhookPath: `/webhooks/whatsapp/${inbox.id}`,
    },
  });
});

app.get("/api/conversations", async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const conversations = await prisma.conversation.findMany({
    where: inboxId ? { inboxId } : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: { inbox: true, contact: true },
  });

  res.json({ conversations });
});

app.get("/api/conversations/:conversationId", async (req, res) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.conversationId },
    include: {
      inbox: true,
      contact: true,
      messages: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { unreadCount: 0 },
  });

  res.json({
    conversation,
    inbox: redactInbox(conversation.inbox),
    contact: conversation.contact,
    messages: conversation.messages,
  });
});

app.post("/api/conversations/:conversationId/messages", async (req, res) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.conversationId },
    include: { inbox: true },
  });

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const meta = await getMetaConfigForInbox(conversation.inboxId);
  if (!meta.phoneNumberId) {
    return res.status(400).json({ error: "Meta phone number ID is not configured for this inbox." });
  }

  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    return res.status(400).json({ error: "Message text is required." });
  }

  try {
    const response = await metaRequest({
      path: `/${meta.graphVersion}/${meta.phoneNumberId}/messages`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: conversation.waId,
        type: "text",
        text: { body: text },
      }),
      config: meta,
    });

    const messageId =
      (response as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? `local-${Date.now()}`;

    await prisma.message.upsert({
      where: { id: messageId },
      update: {
        text,
        status: "accepted",
        rawJson: response,
      },
      create: {
        id: messageId,
        conversationId: conversation.id,
        waId: conversation.waId,
        inboxId: conversation.inboxId,
        type: "text",
        direction: "outgoing",
        text,
        rawJson: response,
        timestamp: new Date(),
        status: "accepted",
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text,
      },
    });

    return res.json({ success: true, response });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to send message.",
    });
  }
});

app.get("/api/resources/phone-numbers", async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const meta = await getMetaConfigForInbox(inboxId);
  if (!meta.wabaId) {
    return res.status(400).json({ error: "WABA ID is required." });
  }

  try {
    const response = await metaRequest({
      path: `/${meta.graphVersion}/${meta.wabaId}/phone_numbers`,
      query: new URLSearchParams({
        fields: "id,display_phone_number,verified_name,status,quality_rating,code_verification_status",
      }),
      config: meta,
    });
    return res.json(response);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Failed to fetch phone numbers." });
  }
});

app.get("/api/resources/templates", async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const meta = await getMetaConfigForInbox(inboxId);
  if (!meta.wabaId) {
    return res.status(400).json({ error: "WABA ID is required." });
  }

  try {
    const response = await metaRequest({
      path: `/${meta.graphVersion}/${meta.wabaId}/message_templates`,
      config: meta,
    });
    return res.json(response);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Failed to fetch templates." });
  }
});

app.all("/api/meta/*proxyPath", async (req, res) => {
  const proxyPath = String(req.params.proxyPath ?? "");
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "inboxId") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
    } else if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  try {
    const contentType = req.headers["content-type"];
    const response = await metaRequest({
      path: `/${proxyPath}`,
      method: req.method,
      query,
      headers: contentType ? { "Content-Type": contentType } : {},
      body: req.method === "GET" || req.method === "HEAD" ? null : (req.body as unknown as BodyInit),
      config: await getMetaConfigForInbox(inboxId),
    });
    return res.json(response);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Meta proxy failed." });
  }
});

app.get("/webhooks/whatsapp", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const admin = await getAdminMetaAppConfig();
  const globalMeta = await getMetaConfig();
  const validToken = admin.verifyToken || globalMeta.verifyToken;

  if (mode === "subscribe" && token === validToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Verification failed");
});

app.get("/webhooks/whatsapp/:inboxId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const inbox = await prisma.inbox.findUnique({ where: { id: req.params.inboxId } });

  if (!inbox) {
    return res.status(404).send("Inbox not found");
  }

  if (mode === "subscribe" && token === inbox.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Verification failed");
});

app.post("/webhooks/whatsapp", async (req, res) => {
  await ingestWebhookPayload(req.body);
  res.status(200).json({ received: true });
});

app.post("/webhooks/whatsapp/:inboxId", async (req, res) => {
  await ingestWebhookPayload(req.body);
  res.status(200).json({ received: true, inboxId: req.params.inboxId });
});

ensureBootstrapData()
  .then(() => {
    app.listen(port, () => {
      console.log(`Whatflow API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to bootstrap Whatflow API", error);
    process.exit(1);
  });
