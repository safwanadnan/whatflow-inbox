# Whatflow Inbox

Whatflow is a self-hostable WhatsApp inbox shaped after the parts of Chatwoot that matter for a WhatsApp-only team: inbox setup, contacts, conversations, messages, templates, phone numbers, webhook intake, and an escape hatch proxy for the rest of the Meta Cloud API.

This initial scaffold wraps the Meta Cloud API in two ways:

- opinionated inbox endpoints for the UI
- a raw passthrough proxy so advanced users can still hit the full Graph API surface

## What is included

- Node/Express API with local JSON persistence
- Meta Cloud API config and wrapper endpoints
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

3. Start both apps:

```bash
npm run dev
```

4. Open the web app at [http://localhost:5173](http://localhost:5173)

## Backend capabilities

- `GET /api/config/meta`: inspect current Meta setup
- `PUT /api/config/meta`: save Meta credentials and IDs
- `GET /api/conversations`: list locally stored conversations
- `GET /api/conversations/:id`: fetch a conversation detail view
- `POST /api/conversations/:id/messages`: send outbound text messages through Meta
- `GET /api/resources/phone-numbers`: list WABA phone numbers
- `GET /api/resources/templates`: list message templates
- `ALL /api/meta/*`: passthrough proxy for the rest of the Graph API
- `GET /webhooks/whatsapp`: Meta webhook verification
- `POST /webhooks/whatsapp`: incoming webhook ingestion

## Product direction

This is deliberately closer to "WhatsApp inbox plus full API wrapper" than a general helpdesk. The next logical slices are:

1. Multi-workspace auth and roles
2. Media upload/download and template send flows
3. Tagging, assignment, notes, SLA states, canned replies
4. Flow builder, phone number management, and compliance screens
5. Full OpenAPI-driven endpoint explorer/generator for every Cloud API operation

## Notes

- Data is stored in `apps/api/data/store.json` for now.
- The raw Meta proxy is the bridge to complete API coverage while the opinionated UI catches up.
- The Chatwoot repo is kept only as a product/IA reference, not runtime code.
