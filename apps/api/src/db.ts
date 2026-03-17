import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as prismaPkg from "../../../generated/prisma/client.js";
import bcrypt from "bcryptjs";

const prismaModule = (prismaPkg as any).default ?? prismaPkg;
const { PrismaClient } = prismaModule;

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __whatflowPrisma: PrismaClientInstance | undefined;
}

const connectionString = process.env.DATABASE_URL ?? "";
const isAccelerate = connectionString.startsWith("prisma+");

const prismaOptions: any = {
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
};

if (isAccelerate) {
  prismaOptions.accelerateUrl = connectionString;
} else {
  prismaOptions.adapter = new PrismaPg({ connectionString });
}

export const prisma =
  global.__whatflowPrisma ??
  new PrismaClient(prismaOptions);

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
  const seedEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const seedPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (platformCount === 0 && seedEmail && seedPassword) {
    await prisma.platformUser.create({
      data: {
        name: process.env.PLATFORM_ADMIN_NAME ?? "Whatflow Admin",
        email: seedEmail,
        passwordHash: await bcrypt.hash(seedPassword, 10),
      },
    });
  }
}

export async function getSetupStatus() {
  const platformCount = await prisma.platformUser.count();
  const hasEnvBootstrap = Boolean(
    (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim() && (process.env.PLATFORM_ADMIN_PASSWORD ?? "").trim(),
  );

  return {
    isInitialized: platformCount > 0,
    requiresBootstrap: platformCount === 0,
    allowFirstUserSignup: platformCount === 0,
    seededFromEnv: platformCount > 0 && hasEnvBootstrap,
  };
}
