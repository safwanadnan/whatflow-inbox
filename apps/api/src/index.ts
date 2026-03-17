import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import multer from "multer";
import { prisma, ensureBootstrapData } from "./db.js";
import {
  comparePassword,
  hashPassword,
  issueToken,
  requireAccountAccess,
  requireAuth,
  requirePlatformAdmin,
  resolveActorForConversation,
} from "./auth.js";
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
const upload = multer({ storage: multer.memoryStorage() });
type AgentRoleInput = "admin" | "manager" | "agent";

app.use(cors({ origin: process.env.APP_URL?.split(",") ?? true }));
app.use("/api/meta", express.raw({ type: "*/*", limit: "20mb" }));
app.use(
  express.json({
    limit: "20mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);

function redactAdminConfig(config: Awaited<ReturnType<typeof getAdminMetaAppConfig>>) {
  return { ...config, appSecret: config.appSecret ? "saved" : "", systemUserAccessToken: config.systemUserAccessToken ? "saved" : "" };
}

function redactInbox<T extends { accessToken: string; verifyToken: string }>(inbox: T) {
  return { ...inbox, accessToken: inbox.accessToken ? "saved" : "", verifyToken: inbox.verifyToken ? "saved" : "" };
}

async function verifyWebhookSignature(req: express.Request) {
  const admin = await getAdminMetaAppConfig();
  const signature = req.headers["x-hub-signature-256"];
  if (!admin.appSecret || !signature || !req.rawBody) return true;
  const expected = `sha256=${crypto.createHmac("sha256", admin.appSecret).update(req.rawBody).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const accountId = String(req.body?.accountId ?? "").trim();
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const platform = await prisma.platformUser.findUnique({ where: { email } });
  if (platform && (await comparePassword(password, platform.passwordHash))) {
    await prisma.platformUser.update({ where: { id: platform.id }, data: { lastLoginAt: new Date() } });
    return res.json({ token: issueToken({ sub: platform.id, type: "platform", role: platform.role, email: platform.email, name: platform.name }), actor: { type: "platform", name: platform.name, email: platform.email } });
  }

  const agent = await prisma.agent.findFirst({ where: { email, ...(accountId ? { accountId } : {}) }, include: { account: true } });
  if (agent && agent.passwordHash && (await comparePassword(password, agent.passwordHash))) {
    await prisma.agent.update({ where: { id: agent.id }, data: { lastLoginAt: new Date() } });
    return res.json({ token: issueToken({ sub: agent.id, type: "agent", role: agent.role, email: agent.email, name: agent.name, accountId: agent.accountId }), actor: { type: "agent", name: agent.name, email: agent.email, accountId: agent.accountId, role: agent.role } });
  }

  return res.status(401).json({ error: "Invalid credentials." });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ user: req.sessionUser });
});

app.get("/api/health", async (_req, res) => {
  await ensureBootstrapData();
  res.json({ ok: true, service: "whatflow-api" });
});

app.get("/api/bootstrap", requireAuth, async (req, res) => {
  await ensureBootstrapData();
  const accountFilter = req.sessionUser?.type === "agent" ? { id: req.sessionUser.accountId } : undefined;
  const [adminMetaApp, accounts, inboxes, conversations] = await Promise.all([
    getAdminMetaAppConfig(),
    prisma.account.findMany({
      where: accountFilter,
      orderBy: { createdAt: "asc" },
      include: {
        agents: { orderBy: { createdAt: "asc" }, select: { id: true, accountId: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true } },
        labels: true,
        cannedResponses: true,
      },
    }),
    prisma.inbox.findMany({
      where: req.sessionUser?.type === "agent" ? { accountId: req.sessionUser.accountId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { account: true },
    }),
    prisma.conversation.findMany({
      where: req.sessionUser?.type === "agent" ? { inbox: { accountId: req.sessionUser.accountId } } : undefined,
      orderBy: { lastMessageAt: "desc" },
      include: { inbox: true, contact: true, assignee: { select: { id: true, name: true, email: true, role: true } }, labels: { include: { label: true } } },
    }),
  ]);

  res.json({
    viewer: req.sessionUser,
    adminMetaApp: redactAdminConfig(adminMetaApp),
    accounts,
    inboxes: inboxes.map(redactInbox),
    conversations,
  });
});

app.get("/api/admin/meta-app", requireAuth, requirePlatformAdmin, async (_req, res) => {
  res.json(redactAdminConfig(await getAdminMetaAppConfig()));
});

app.put("/api/admin/meta-app", requireAuth, requirePlatformAdmin, async (req, res) => {
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

app.get("/api/accounts", requireAuth, async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: req.sessionUser?.type === "agent" ? { id: req.sessionUser.accountId } : undefined,
    orderBy: { createdAt: "asc" },
    include: {
      agents: { select: { id: true, accountId: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true } },
      inboxes: true,
      labels: true,
      cannedResponses: true,
    },
  });
  res.json({ accounts });
});

app.post("/api/accounts", requireAuth, requirePlatformAdmin, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Account name is required." });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `account-${Date.now()}`;
  const account = await prisma.account.create({ data: { name, slug } });
  res.status(201).json({ account });
});

app.get("/api/accounts/:accountId/agents", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const agents = await prisma.agent.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: { id: true, accountId: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  });
  res.json({ agents });
});

app.post("/api/accounts/:accountId/agents", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: "Account not found." });
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "agent") as AgentRoleInput;
  if (!name || !email || !password) return res.status(400).json({ error: "Agent name, email, and password are required." });
  const agent = await prisma.agent.create({
    data: {
      accountId: account.id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: role === "admin" || role === "manager" ? role : "agent",
    },
    select: { id: true, accountId: true, name: true, email: true, role: true, isActive: true },
  });
  res.status(201).json({ agent });
});

app.get("/api/accounts/:accountId/labels", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const labels = await prisma.label.findMany({ where: { accountId }, orderBy: { name: "asc" } });
  res.json({ labels });
});

app.post("/api/accounts/:accountId/labels", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Label name is required." });
  const label = await prisma.label.create({
    data: {
      accountId,
      name,
      color: String(req.body?.color ?? "#f0b16d"),
      description: req.body?.description ? String(req.body.description) : null,
    },
  });
  res.status(201).json({ label });
});

app.get("/api/accounts/:accountId/canned-responses", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const cannedResponses = await prisma.cannedResponse.findMany({ where: { accountId }, orderBy: { title: "asc" } });
  res.json({ cannedResponses });
});

app.post("/api/accounts/:accountId/canned-responses", requireAuth, requireAccountAccess, async (req, res) => {
  const accountId = String(req.params.accountId);
  const title = String(req.body?.title ?? "").trim();
  const content = String(req.body?.content ?? "").trim();
  if (!title || !content) return res.status(400).json({ error: "Title and content are required." });
  const cannedResponse = await prisma.cannedResponse.create({ data: { accountId, title, content } });
  res.status(201).json({ cannedResponse });
});

app.get("/api/inboxes", requireAuth, async (req, res) => {
  const inboxes = await prisma.inbox.findMany({
    where: req.sessionUser?.type === "agent" ? { accountId: req.sessionUser.accountId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { account: true },
  });
  res.json({ inboxes: inboxes.map(redactInbox) });
});

app.post("/api/inboxes", requireAuth, async (req, res) => {
  const payload = req.body ?? {};
  const name = String(payload.name ?? "").trim();
  const accountId = String(payload.accountId ?? "").trim();
  const connectionType = payload.connectionType === "embedded" ? "embedded" : "manual";
  if (!name || !accountId) return res.status(400).json({ error: "Inbox name and account are required." });
  if (req.sessionUser?.type === "agent" && req.sessionUser.accountId !== accountId) {
    return res.status(403).json({ error: "You do not have access to this account." });
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: "Account not found." });
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
  res.status(201).json({ inbox: redactInbox(inbox), setup: { webhookPath: `/webhooks/whatsapp/${inbox.id}`, embeddedSignupReady: connectionType === "embedded" && Boolean(adminConfig.appId && adminConfig.configurationId) } });
});

app.post("/api/inboxes/embedded/exchange", requireAuth, async (req, res) => {
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
  if (req.sessionUser?.type === "agent" && req.sessionUser.accountId !== accountId) {
    return res.status(403).json({ error: "You do not have access to this account." });
  }
  const tokenResponse = await exchangeEmbeddedSignupCode({ code, redirectUri });
  const adminConfig = await getAdminMetaAppConfig();
  const accessToken = tokenResponse.access_token || adminConfig.systemUserAccessToken;
  if (!accessToken) return res.status(400).json({ error: "No access token was returned from the Meta code exchange." });
  const inbox = await prisma.inbox.create({
    data: { accountId, name, connectionType: "embedded", status: "connected", phoneNumber, phoneNumberId, businessAccountId, accessToken, verifyToken: adminConfig.verifyToken, metaAppId: adminConfig.appId },
  });
  res.status(201).json({ inbox: redactInbox(inbox), tokenExchange: { tokenType: tokenResponse.token_type ?? "bearer", webhookPath: `/webhooks/whatsapp/${inbox.id}` } });
});

app.post("/api/inboxes/:inboxId/media", requireAuth, upload.single("file"), async (req, res) => {
  const inboxId = String(req.params.inboxId);
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox) return res.status(404).json({ error: "Inbox not found." });
  if (req.sessionUser?.type === "agent" && req.sessionUser.accountId !== inbox.accountId) {
    return res.status(403).json({ error: "You do not have access to this inbox." });
  }
  if (!req.file) return res.status(400).json({ error: "A file is required." });
  const meta = await getMetaConfigForInbox(inbox.id);
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", new Blob([Uint8Array.from(req.file.buffer)], { type: req.file.mimetype }), req.file.originalname);
  try {
    const response = await metaRequest({ path: `/${meta.graphVersion}/${meta.phoneNumberId}/media`, method: "POST", body: formData, config: meta });
    res.json({ media: response });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to upload media." });
  }
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const conversations = await prisma.conversation.findMany({
    where: {
      ...(inboxId ? { inboxId } : {}),
      ...(req.sessionUser?.type === "agent" ? { inbox: { accountId: req.sessionUser.accountId } } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: { inbox: true, contact: true, assignee: { select: { id: true, name: true, email: true, role: true } }, labels: { include: { label: true } } },
  });
  res.json({ conversations });
});

app.get("/api/conversations/:conversationId", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      inbox: true,
      contact: true,
      assignee: { select: { id: true, name: true, email: true, role: true } },
      messages: { orderBy: { timestamp: "asc" } },
      notes: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" } },
      labels: { include: { label: true } },
    },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (req.sessionUser?.type === "agent" && conversation.inbox.accountId !== req.sessionUser.accountId) {
    return res.status(403).json({ error: "You do not have access to this conversation." });
  }
  await prisma.conversation.update({ where: { id: conversation.id }, data: { unreadCount: 0 } });
  res.json({ conversation, inbox: redactInbox(conversation.inbox), contact: conversation.contact, messages: conversation.messages, notes: conversation.notes, labels: conversation.labels.map((entry: { label: unknown }) => entry.label), assignee: conversation.assignee });
});

app.post("/api/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { inbox: true } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (req.sessionUser?.type === "agent" && conversation.inbox.accountId !== req.sessionUser.accountId) {
    return res.status(403).json({ error: "You do not have access to this conversation." });
  }
  const meta = await getMetaConfigForInbox(conversation.inboxId);
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "Message text is required." });
  try {
    const response = await metaRequest({
      path: `/${meta.graphVersion}/${meta.phoneNumberId}/messages`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: conversation.waId, type: "text", text: { body: text } }),
      config: meta,
    });
    const messageId = (response as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? `local-${Date.now()}`;
    await prisma.message.upsert({
      where: { id: messageId },
      update: { text, status: "accepted", rawJson: response },
      create: { id: messageId, conversationId: conversation.id, waId: conversation.waId, inboxId: conversation.inboxId, type: "text", direction: "outgoing", text, rawJson: response, timestamp: new Date(), status: "accepted" },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), lastMessagePreview: text } });
    res.json({ success: true, response });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to send message." });
  }
});

app.post("/api/conversations/:conversationId/messages/template", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { inbox: true } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (req.sessionUser?.type === "agent" && conversation.inbox.accountId !== req.sessionUser.accountId) {
    return res.status(403).json({ error: "You do not have access to this conversation." });
  }
  const meta = await getMetaConfigForInbox(conversation.inboxId);
  const templateName = String(req.body?.templateName ?? "").trim();
  const languageCode = String(req.body?.languageCode ?? "en_US").trim();
  const bodyParameters = Array.isArray(req.body?.bodyParameters) ? req.body.bodyParameters.map((value: unknown) => ({ type: "text", text: String(value) })) : [];
  if (!templateName) return res.status(400).json({ error: "Template name is required." });
  try {
    const response = await metaRequest({
      path: `/${meta.graphVersion}/${meta.phoneNumberId}/messages`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conversation.waId,
        type: "template",
        template: { name: templateName, language: { code: languageCode }, components: bodyParameters.length ? [{ type: "body", parameters: bodyParameters }] : undefined },
      }),
      config: meta,
    });
    res.json({ success: true, response });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to send template." });
  }
});

app.post("/api/conversations/:conversationId/assign", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { inbox: true } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (req.sessionUser?.type === "agent" && conversation.inbox.accountId !== req.sessionUser.accountId) {
    return res.status(403).json({ error: "You do not have access to this conversation." });
  }
  const agentId = String(req.body?.agentId ?? "").trim();
  const assignee = agentId ? await prisma.agent.findUnique({ where: { id: agentId } }) : null;
  if (agentId && (!assignee || assignee.accountId !== conversation.inbox.accountId)) {
    return res.status(400).json({ error: "Assignee must belong to the same account." });
  }
  const updated = await prisma.conversation.update({ where: { id: conversation.id }, data: { assigneeId: agentId || null }, include: { assignee: { select: { id: true, name: true, email: true, role: true } } } });
  res.json({ conversation: updated });
});

app.post("/api/conversations/:conversationId/labels", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { inbox: true } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (req.sessionUser?.type === "agent" && conversation.inbox.accountId !== req.sessionUser.accountId) {
    return res.status(403).json({ error: "You do not have access to this conversation." });
  }
  const labelIds = Array.isArray(req.body?.labelIds) ? req.body.labelIds.map((id: unknown) => String(id)) : [];
  await prisma.conversationLabel.deleteMany({ where: { conversationId: conversation.id } });
  if (labelIds.length) {
    await prisma.conversationLabel.createMany({ data: labelIds.map((labelId: string) => ({ conversationId: conversation.id, labelId })) });
  }
  const labels = await prisma.conversationLabel.findMany({ where: { conversationId: conversation.id }, include: { label: true } });
  res.json({ labels: labels.map((entry: { label: unknown }) => entry.label) });
});

app.get("/api/conversations/:conversationId/notes", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const { canAccess } = await resolveActorForConversation(conversationId, req.sessionUser!);
  if (!canAccess) return res.status(403).json({ error: "You do not have access to this conversation." });
  const notes = await prisma.note.findMany({ where: { conversationId }, include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ notes });
});

app.post("/api/conversations/:conversationId/notes", requireAuth, async (req, res) => {
  const conversationId = String(req.params.conversationId);
  const { canAccess, agent } = await resolveActorForConversation(conversationId, req.sessionUser!);
  if (!canAccess) return res.status(403).json({ error: "You do not have access to this conversation." });
  if (!agent) return res.status(400).json({ error: "Notes must be authored by an account agent." });
  const content = String(req.body?.content ?? "").trim();
  if (!content) return res.status(400).json({ error: "Note content is required." });
  const note = await prisma.note.create({ data: { conversationId, authorAgentId: agent.id, content }, include: { author: { select: { id: true, name: true, email: true } } } });
  res.status(201).json({ note });
});

app.get("/api/resources/phone-numbers", requireAuth, async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const meta = await getMetaConfigForInbox(inboxId);
  if (!meta.wabaId) return res.status(400).json({ error: "WABA ID is required." });
  try {
    const response = await metaRequest({ path: `/${meta.graphVersion}/${meta.wabaId}/phone_numbers`, query: new URLSearchParams({ fields: "id,display_phone_number,verified_name,status,quality_rating,code_verification_status" }), config: meta });
    res.json(response);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to fetch phone numbers." });
  }
});

app.get("/api/resources/templates", requireAuth, async (req, res) => {
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const meta = await getMetaConfigForInbox(inboxId);
  if (!meta.wabaId) return res.status(400).json({ error: "WABA ID is required." });
  try {
    const response = await metaRequest({ path: `/${meta.graphVersion}/${meta.wabaId}/message_templates`, config: meta });
    res.json(response);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to fetch templates." });
  }
});

app.all("/api/meta/*proxyPath", requireAuth, async (req, res) => {
  const proxyPath = String(req.params.proxyPath ?? "");
  const inboxId = typeof req.query.inboxId === "string" ? req.query.inboxId : undefined;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "inboxId") continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else if (value !== undefined) query.set(key, String(value));
  }
  try {
    const contentType = req.headers["content-type"];
    const response = await metaRequest({ path: `/${proxyPath}`, method: req.method, query, headers: contentType ? { "Content-Type": contentType } : {}, body: req.method === "GET" || req.method === "HEAD" ? null : (req.body as unknown as BodyInit), config: await getMetaConfigForInbox(inboxId) });
    res.json(response);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Meta proxy failed." });
  }
});

app.get("/webhooks/whatsapp", async (req, res) => {
  const admin = await getAdminMetaAppConfig();
  const globalMeta = await getMetaConfig();
  const validToken = admin.verifyToken || globalMeta.verifyToken;
  if (String(req.query["hub.mode"] ?? "") === "subscribe" && String(req.query["hub.verify_token"] ?? "") === validToken) return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
  return res.status(403).send("Verification failed");
});

app.get("/webhooks/whatsapp/:inboxId", async (req, res) => {
  const inbox = await prisma.inbox.findUnique({ where: { id: req.params.inboxId } });
  if (!inbox) return res.status(404).send("Inbox not found");
  if (String(req.query["hub.mode"] ?? "") === "subscribe" && String(req.query["hub.verify_token"] ?? "") === inbox.verifyToken) return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
  return res.status(403).send("Verification failed");
});

app.post("/webhooks/whatsapp", async (req, res) => {
  if (!(await verifyWebhookSignature(req))) return res.status(401).json({ error: "Invalid webhook signature." });
  await ingestWebhookPayload(req.body);
  res.status(200).json({ received: true });
});

app.post("/webhooks/whatsapp/:inboxId", async (req, res) => {
  if (!(await verifyWebhookSignature(req))) return res.status(401).json({ error: "Invalid webhook signature." });
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
