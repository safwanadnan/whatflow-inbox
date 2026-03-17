# Whatflow Inbox

Whatflow is a self-hostable WhatsApp inbox shaped after the parts of Chatwoot that matter for a WhatsApp-only team: admin setup, accounts, agents, inbox creation, embedded signup, contacts, conversations, messages, templates, phone numbers, webhook intake, and an escape hatch proxy for the rest of the Meta Cloud API.

This initial scaffold wraps the Meta Cloud API in two ways:

- opinionated inbox endpoints for the UI
- a raw passthrough proxy so advanced users can still hit the full Graph API surface

## What is included

- Node/Express API with Prisma and PostgreSQL
- Meta Cloud API config and wrapper endpoints
- Admin-managed Meta Embedded Signup settings
- Workspace accounts and agent management
- Platform admin and agent login
- Conversation assignment, labels, notes, and canned responses
- Media upload and template message send endpoints
- WhatsApp webhook verification and ingestion
- Conversation/contact/message timeline storage
- React/Vite inbox UI
- Dockerfiles and `docker-compose.yaml` for self-hosting

## Structure

- `apps/api`: backend wrapper, webhook processing, persistence
- `apps/web`: inbox UI
- `whatsapp.yaml`: the Meta WhatsApp/Graph OpenAPI reference you provided
- `chatwoot-reference`: local upstream Chatwoot reference checkout

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy envs:

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

3. Start PostgreSQL and create Prisma tables:

```bash
docker compose up -d postgres
npx prisma generate
npx prisma db push
```

4. Start both apps:

```bash
npm run dev
```

5. Open the web app at [http://localhost:5173](http://localhost:5173)

## Backend capabilities

- `POST /api/auth/login`: platform admin or agent login
- `GET /api/auth/me`: inspect the active session
- `GET /api/admin/meta-app`: inspect shared Meta Embedded Signup config
- `PUT /api/admin/meta-app`: save shared Meta app credentials
- `POST /api/accounts`: create a workspace account
- `POST /api/accounts/:accountId/agents`: create account-level agents
- `POST /api/accounts/:accountId/labels`: create labels
- `POST /api/accounts/:accountId/canned-responses`: create canned replies
- `POST /api/inboxes`: create manual or draft embedded inboxes
- `POST /api/inboxes/embedded/exchange`: exchange Meta signup code and finalize embedded inbox creation
- `GET /api/conversations`: list locally stored conversations
- `GET /api/conversations/:id`: fetch a conversation detail view
- `POST /api/conversations/:id/messages`: send outbound text messages through Meta
- `POST /api/conversations/:id/messages/template`: send template messages
- `POST /api/conversations/:id/assign`: assign a conversation
- `POST /api/conversations/:id/labels`: attach labels
- `POST /api/conversations/:id/notes`: add internal notes
- `POST /api/inboxes/:inboxId/media`: upload media to Meta
- `GET /api/resources/phone-numbers`: list WABA phone numbers
- `GET /api/resources/templates`: list message templates
- `ALL /api/meta/*`: passthrough proxy for the rest of the Graph API
- `GET /webhooks/whatsapp`: shared Meta webhook verification
- `GET /webhooks/whatsapp/:inboxId`: per-inbox webhook verification
- `POST /webhooks/whatsapp`: incoming webhook ingestion

## Product direction

This is deliberately closer to "WhatsApp inbox plus full API wrapper" than a general helpdesk. The next logical slices are:

1. Multi-workspace auth and roles
2. Media upload/download and template send flows
3. Tagging, assignment, notes, SLA states, canned replies
4. Flow builder, phone number management, and compliance screens
5. Full OpenAPI-driven endpoint explorer/generator for every Cloud API operation

## Notes

- Data is stored in PostgreSQL through Prisma.
- The raw Meta proxy is the bridge to complete API coverage while the opinionated UI catches up.
- The Chatwoot repo is kept only as a product/IA reference, not runtime code.
- Embedded signup uses the Facebook JavaScript SDK on the frontend and a backend code exchange against Meta OAuth.
- Webhook POSTs now support optional `X-Hub-Signature-256` verification using the admin Meta app secret.
