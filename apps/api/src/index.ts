import "dotenv/config";
import cors from "cors";
import express from "express";
import { getAdminMetaAppConfig, getMetaConfig, getMetaConfigForInbox, metaRequest } from "./meta.js";
import { Inbox, readStore, updateStore } from "./store.js";
import { ingestWebhookPayload } from "./webhook.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.APP_URL?.split(",") ?? true }));
app.use("/api/meta", express.raw({ type: "*/*", limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));

function redactInbox(inbox: Inbox) {
  return {
    ...inbox,
    accessToken: inbox.accessToken ? "saved" : "",
    verifyToken: inbox.verifyToken ? "saved" : "",
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "whatflow-api" });
});

app.get("/api/bootstrap", (_req, res) => {
  const store = readStore();
  res.json({
    adminMetaApp: {
      ...store.config.adminMetaApp,
      appSecret: store.config.adminMetaApp.appSecret ? "saved" : "",
      systemUserAccessToken: store.config.adminMetaApp.systemUserAccessToken ? "saved" : "",
    },
    accounts: store.accounts,
    inboxes: store.inboxes.map(redactInbox),
    conversations: store.conversations
      .slice()
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((conversation) => ({
        ...conversation,
        inbox: store.inboxes.find((inbox) => inbox.id === conversation.inboxId),
        contact: store.contacts.find((contact) => contact.id === conversation.contactId),
      })),
  });
});

app.get("/api/config/meta", (_req, res) => {
  const meta = getMetaConfig();
  res.json({
    ...meta,
    accessToken: meta.accessToken ? `${meta.accessToken.slice(0, 8)}...` : "",
  });
});

app.put("/api/config/meta", (req, res) => {
  const payload = req.body ?? {};
  const meta = updateStore((store) => {
    store.config.meta = {
      ...store.config.meta,
      accessToken: payload.accessToken ?? store.config.meta.accessToken,
      verifyToken: payload.verifyToken ?? store.config.meta.verifyToken,
      graphBaseUrl: payload.graphBaseUrl ?? store.config.meta.graphBaseUrl,
      graphVersion: payload.graphVersion ?? store.config.meta.graphVersion,
      wabaId: payload.wabaId ?? store.config.meta.wabaId,
      phoneNumberId: payload.phoneNumberId ?? store.config.meta.phoneNumberId,
    };
    return store.config.meta;
  });

  res.json({ success: true, meta: { ...meta, accessToken: meta.accessToken ? "saved" : "" } });
});

app.get("/api/admin/meta-app", (_req, res) => {
  const config = getAdminMetaAppConfig();
  res.json({
    ...config,
    appSecret: config.appSecret ? "saved" : "",
    systemUserAccessToken: config.systemUserAccessToken ? "saved" : "",
  });
});

app.put("/api/admin/meta-app", (req, res) => {
  const payload = req.body ?? {};
  const config = updateStore((store) => {
    store.config.adminMetaApp = {
      ...store.config.adminMetaApp,
      embeddedSignupEnabled: payload.embeddedSignupEnabled ?? store.config.adminMetaApp.embeddedSignupEnabled,
      appId: payload.appId ?? store.config.adminMetaApp.appId,
      appSecret: payload.appSecret || store.config.adminMetaApp.appSecret,
      configurationId: payload.configurationId ?? store.config.adminMetaApp.configurationId,
      verifyToken: payload.verifyToken ?? store.config.adminMetaApp.verifyToken,
      systemUserAccessToken: payload.systemUserAccessToken || store.config.adminMetaApp.systemUserAccessToken,
      graphBaseUrl: payload.graphBaseUrl ?? store.config.adminMetaApp.graphBaseUrl,
      graphVersion: payload.graphVersion ?? store.config.adminMetaApp.graphVersion,
      webhookCallbackUrl: payload.webhookCallbackUrl ?? store.config.adminMetaApp.webhookCallbackUrl,
    };
    return store.config.adminMetaApp;
  });

  res.json({
    success: true,
    config: {
      ...config,
      appSecret: config.appSecret ? "saved" : "",
      systemUserAccessToken: config.systemUserAccessToken ? "saved" : "",
    },
  });
});

app.get("/api/accounts", (_req, res) => {
  res.json({ accounts: readStore().accounts });
});

app.post("/api/accounts", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    return res.status(400).json({ error: "Account name is required." });
  }

  const account = updateStore((store) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const created = {
      id: `acct-${Date.now()}`,
      name,
      slug: slug || `account-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    store.accounts.push(created);
    return created;
  });

  return res.status(201).json({ account });
});

app.get("/api/inboxes", (_req, res) => {
  const store = readStore();
  res.json({
    inboxes: store.inboxes.map((inbox) => ({
      ...redactInbox(inbox),
      account: store.accounts.find((account) => account.id === inbox.accountId),
    })),
  });
});

app.post("/api/inboxes", (req, res) => {
  const payload = req.body ?? {};
  const name = String(payload.name ?? "").trim();
  const accountId = String(payload.accountId ?? "").trim();
  const connectionType = payload.connectionType === "embedded" ? "embedded" : "manual";

  if (!name || !accountId) {
    return res.status(400).json({ error: "Inbox name and account are required." });
  }

  const store = readStore();
  const account = store.accounts.find((item) => item.id === accountId);
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  if (connectionType === "embedded" && !store.config.adminMetaApp.embeddedSignupEnabled) {
    return res.status(400).json({ error: "Embedded signup has not been enabled by the admin yet." });
  }

  const inbox = updateStore((next) => {
    const created: Inbox = {
      id: `inbox-${Date.now()}`,
      accountId,
      name,
      connectionType,
      status: connectionType === "manual" ? "connected" : "draft",
      phoneNumber: String(payload.phoneNumber ?? ""),
      phoneNumberId: String(payload.phoneNumberId ?? ""),
      businessAccountId: String(payload.businessAccountId ?? ""),
      accessToken: String(payload.accessToken ?? ""),
      verifyToken: String(
        payload.verifyToken ??
          (connectionType === "embedded" ? next.config.adminMetaApp.verifyToken : next.config.meta.verifyToken),
      ),
      metaAppId:
        connectionType === "embedded" ? next.config.adminMetaApp.appId || String(payload.metaAppId ?? "") : "",
      createdAt: new Date().toISOString(),
    };
    next.inboxes.push(created);
    return created;
  });

  return res.status(201).json({
    inbox: redactInbox(inbox),
    setup: {
      webhookPath: `/webhooks/whatsapp/${inbox.id}`,
      embeddedSignupReady:
        connectionType === "embedded" &&
        Boolean(store.config.adminMetaApp.appId && store.config.adminMetaApp.configurationId),
    },
  });
});

app.get("/api/setup/embedded", (_req, res) => {
  const config = getAdminMetaAppConfig();
  res.json({
    enabled: config.embeddedSignupEnabled,
    appId: config.appId,
    configurationId: config.configurationId,
    graphVersion: config.graphVersion,
    webhookCallbackUrl: config.webhookCallbackUrl,
    verifyTokenConfigured: Boolean(config.verifyToken),
  });
});

app.get("/api/conversations", (req, res) => {
  const store = readStore();
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : "";
  const conversations = [...store.conversations]
    .filter((conversation) => !inboxId || conversation.inboxId === inboxId)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  res.json({
    conversations: conversations.map((conversation) => ({
      ...conversation,
      inbox: store.inboxes.find((inbox) => inbox.id === conversation.inboxId),
      contact: store.contacts.find((contact) => contact.id === conversation.contactId),
    })),
  });
});

app.get("/api/conversations/:conversationId", (req, res) => {
  const store = readStore();
  const conversation = store.conversations.find((item) => item.id === req.params.conversationId);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const messages = store.messages
    .filter((item) => item.conversationId === conversation.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  updateStore((next) => {
    const target = next.conversations.find((item) => item.id === conversation.id);
    if (target) target.unreadCount = 0;
    return target;
  });

  return res.json({
    conversation,
    inbox: store.inboxes.find((item) => item.id === conversation.inboxId),
    contact: store.contacts.find((item) => item.id === conversation.contactId),
    messages,
  });
});

app.post("/api/conversations/:conversationId/messages", async (req, res) => {
  const store = readStore();
  const conversation = store.conversations.find((item) => item.id === req.params.conversationId);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const meta = getMetaConfigForInbox(conversation.inboxId);
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

    updateStore((next) => {
      next.messages.push({
        id: messageId,
        conversationId: conversation.id,
        waId: conversation.waId,
        inboxId: conversation.inboxId,
        type: "text",
        direction: "outgoing",
        text,
        raw: response,
        timestamp: new Date().toISOString(),
        status: "accepted",
      });

      const target = next.conversations.find((item) => item.id === conversation.id);
      if (target) {
        target.lastMessageAt = new Date().toISOString();
        target.lastMessagePreview = text;
      }
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
  const meta = getMetaConfigForInbox(inboxId);
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
  const meta = getMetaConfigForInbox(inboxId);
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
      config: getMetaConfigForInbox(inboxId),
    });
    return res.json(response);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Meta proxy failed." });
  }
});

app.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const store = readStore();
  const validToken = store.config.adminMetaApp.verifyToken || store.config.meta.verifyToken;

  if (mode === "subscribe" && token === validToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Verification failed");
});

app.get("/webhooks/whatsapp/:inboxId", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const store = readStore();
  const inbox = store.inboxes.find((item) => item.id === req.params.inboxId);

  if (!inbox) {
    return res.status(404).send("Inbox not found");
  }

  if (mode === "subscribe" && token === inbox.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Verification failed");
});

app.post("/webhooks/whatsapp", (req, res) => {
  ingestWebhookPayload(req.body);
  res.status(200).json({ received: true });
});

app.post("/webhooks/whatsapp/:inboxId", (req, res) => {
  ingestWebhookPayload(req.body);
  res.status(200).json({ received: true, inboxId: req.params.inboxId });
});

app.listen(port, () => {
  console.log(`Whatflow API running on http://localhost:${port}`);
});
