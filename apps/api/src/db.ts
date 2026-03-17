import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client.js";
import bcrypt from "bcryptjs";

declare global {
  // eslint-disable-next-line no-var
  var __whatflowPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__whatflowPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__whatflowPrisma = prisma;
}

export async function ensureBootstrapData() {
  await prisma.globalMetaConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      accessToken: process.env.META_ACCESS_TOKEN ?? "",
      verifyToken: process.env.META_VERIFY_TOKEN ?? "",
      graphBaseUrl: process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com",
      graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
      wabaId: process.env.META_WABA_ID ?? "",
      phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? "",
    },
  });

  await prisma.adminMetaAppConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      embeddedSignupEnabled: false,
      appId: process.env.META_APP_ID ?? "",
      appSecret: process.env.META_APP_SECRET ?? "",
      configurationId: process.env.META_CONFIGURATION_ID ?? "",
      verifyToken: process.env.META_VERIFY_TOKEN ?? "",
      systemUserAccessToken: process.env.META_SYSTEM_USER_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN ?? "",
      graphBaseUrl: process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com",
      graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
      webhookCallbackUrl: process.env.META_WEBHOOK_CALLBACK_URL ?? "",
    },
  });

  const count = await prisma.account.count();
  if (count === 0) {
    await prisma.account.create({
      data: {
        name: "Default Account",
        slug: "default-account",
      },
    });
  }

  const platformCount = await prisma.platformUser.count();
  if (platformCount === 0) {
    await prisma.platformUser.create({
      data: {
        name: process.env.PLATFORM_ADMIN_NAME ?? "Whatflow Admin",
        email: (process.env.PLATFORM_ADMIN_EMAIL ?? "admin@example.com").toLowerCase(),
        passwordHash: await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD ?? "change-me", 10),
      },
    });
  }
}
