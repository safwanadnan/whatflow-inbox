import { updateStore } from "./store.js";

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: {
            name?: string;
          };
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          timestamp?: string;
          text?: {
            body?: string;
          };
        }>;
        statuses?: Array<{
          id?: string;
          recipient_id?: string;
          status?: string;
          timestamp?: string;
        }>;
        metadata?: {
          phone_number_id?: string;
        };
      };
    }>;
  }>;
};

function isoFromUnix(value?: string) {
  if (!value) return new Date().toISOString();
  return new Date(Number(value) * 1000).toISOString();
}

function conversationIdFor(waId: string) {
  return `wa-${waId}`;
}

export function ingestWebhookPayload(payload: WebhookPayload) {
  updateStore((store) => {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;
        const matchedInbox =
          store.inboxes.find((item) => item.phoneNumberId === value.metadata?.phone_number_id) ?? store.inboxes[0];
        const inboxId = matchedInbox?.id ?? "unassigned";

        for (const contact of value.contacts ?? []) {
          if (!contact.wa_id) continue;
          const existing = store.contacts.find((item) => item.waId === contact.wa_id);
          if (!existing) {
            store.contacts.push({
              id: `contact-${contact.wa_id}`,
              waId: contact.wa_id,
              name: contact.profile?.name ?? contact.wa_id,
              profileName: contact.profile?.name,
            });
          } else if (contact.profile?.name) {
            existing.name = contact.profile.name;
            existing.profileName = contact.profile.name;
          }
        }

        for (const message of value.messages ?? []) {
          if (!message.from || !message.id) continue;
          const conversationId = conversationIdFor(`${inboxId}-${message.from}`);
          const contactId = `contact-${message.from}`;
          const timestamp = isoFromUnix(message.timestamp);
          const text = message.text?.body ?? `[${message.type ?? "message"}]`;
          const existingConversation = store.conversations.find((item) => item.id === conversationId);

          if (!existingConversation) {
            const contact = store.contacts.find((item) => item.id === contactId);
            store.conversations.push({
              id: conversationId,
              inboxId,
              waId: message.from,
              title: contact?.name ?? message.from,
              phoneNumberId: value.metadata?.phone_number_id,
              lastMessageAt: timestamp,
              lastMessagePreview: text,
              unreadCount: 1,
              contactId,
              status: "open",
            });
          } else {
            existingConversation.lastMessageAt = timestamp;
            existingConversation.lastMessagePreview = text;
            existingConversation.unreadCount += 1;
            existingConversation.phoneNumberId = value.metadata?.phone_number_id ?? existingConversation.phoneNumberId;
          }

          const exists = store.messages.some((item) => item.id === message.id);
          if (!exists) {
            store.messages.push({
              id: message.id,
              conversationId,
              waId: message.from,
              inboxId,
              type: message.type ?? "unknown",
              direction: "incoming",
              text,
              raw: message,
              timestamp,
            });
          }
        }

        for (const status of value.statuses ?? []) {
          if (!status.id || !status.recipient_id) continue;
          const conversationId = conversationIdFor(`${inboxId}-${status.recipient_id}`);
          const message = store.messages.find((item) => item.id === status.id);
          if (message) {
            message.status = status.status;
          } else {
            store.messages.push({
              id: status.id,
              conversationId,
              waId: status.recipient_id,
              inboxId,
              type: "status",
              direction: "status",
              raw: status,
              timestamp: isoFromUnix(status.timestamp),
              status: status.status,
            });
          }
        }
      }
    }
  });
}
