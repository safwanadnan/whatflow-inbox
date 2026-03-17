import { prisma } from "./db.js";

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
  if (!value) return new Date();
  return new Date(Number(value) * 1000);
}

export async function ingestWebhookPayload(payload: WebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const inbox = value.metadata?.phone_number_id
        ? await prisma.inbox.findFirst({ where: { phoneNumberId: value.metadata.phone_number_id } })
        : null;

      if (!inbox) continue;

      for (const contact of value.contacts ?? []) {
        if (!contact.wa_id) continue;
        await prisma.contact.upsert({
          where: { waId: contact.wa_id },
          update: {
            name: contact.profile?.name ?? contact.wa_id,
            profileName: contact.profile?.name,
          },
          create: {
            waId: contact.wa_id,
            name: contact.profile?.name ?? contact.wa_id,
            profileName: contact.profile?.name,
          },
        });
      }

      for (const message of value.messages ?? []) {
        if (!message.from || !message.id) continue;
        const contact = await prisma.contact.upsert({
          where: { waId: message.from },
          update: {},
          create: {
            waId: message.from,
            name: message.from,
          },
        });

        const timestamp = isoFromUnix(message.timestamp);
        const text = message.text?.body ?? `[${message.type ?? "message"}]`;

        const existingConversation = await prisma.conversation.findFirst({
          where: {
            inboxId: inbox.id,
            waId: message.from,
          },
        });

        const conversation =
          existingConversation ??
          (await prisma.conversation.create({
            data: {
              inboxId: inbox.id,
              waId: message.from,
              title: contact.name,
              phoneNumberId: value.metadata?.phone_number_id,
              lastMessageAt: timestamp,
              lastMessagePreview: text,
              unreadCount: 0,
              contactId: contact.id,
            },
          }));

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            title: contact.name,
            phoneNumberId: value.metadata?.phone_number_id,
            lastMessageAt: timestamp,
            lastMessagePreview: text,
            unreadCount: { increment: 1 },
          },
        });

        await prisma.message.upsert({
          where: { id: message.id },
          update: {
            text,
            rawJson: message,
            timestamp,
          },
          create: {
            id: message.id,
            conversationId: conversation.id,
            waId: message.from,
            inboxId: inbox.id,
            type: message.type ?? "unknown",
            direction: "incoming",
            text,
            rawJson: message,
            timestamp,
          },
        });
      }

      for (const status of value.statuses ?? []) {
        if (!status.id || !status.recipient_id) continue;

        const conversation = await prisma.conversation.findFirst({
          where: {
            inboxId: inbox.id,
            waId: status.recipient_id,
          },
        });

        if (!conversation) continue;

        const existingMessage = await prisma.message.findUnique({ where: { id: status.id } });
        if (existingMessage) {
          await prisma.message.update({
            where: { id: status.id },
            data: {
              status: status.status,
            },
          });
        } else {
          await prisma.message.create({
            data: {
              id: status.id,
              conversationId: conversation.id,
              waId: status.recipient_id,
              inboxId: inbox.id,
              type: "status",
              direction: "status",
              rawJson: status,
              timestamp: isoFromUnix(status.timestamp),
              status: status.status,
            },
          });
        }
      }
    }
  }
}
