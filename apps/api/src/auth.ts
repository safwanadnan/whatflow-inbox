import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const jwtSecret = process.env.JWT_SECRET ?? "change-me";
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS ?? 24);

export type SessionPayload = {
  sub: string;
  type: "platform" | "agent";
  role: string;
  accountId?: string;
  email: string;
  name: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function issueToken(payload: SessionPayload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: `${sessionTtlHours}h` });
}

export function verifyToken(token: string) {
  return jwt.verify(token, jwtSecret) as SessionPayload;
}

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionPayload;
      rawBody?: Buffer;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.sessionUser = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.sessionUser || req.sessionUser.type !== "platform") {
    return res.status(403).json({ error: "Platform admin access required." });
  }
  return next();
}

export function requireAccountAccess(req: Request, res: Response, next: NextFunction) {
  const accountId = req.params.accountId || req.body?.accountId || req.query.accountId;
  if (!req.sessionUser) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (req.sessionUser.type === "platform") {
    return next();
  }
  if (req.sessionUser.accountId && String(accountId) === req.sessionUser.accountId) {
    return next();
  }
  return res.status(403).json({ error: "You do not have access to this account." });
}

export async function resolveActorForConversation(conversationId: string, session: SessionPayload) {
  if (session.type === "platform") {
    return { canAccess: true, agent: null };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { inbox: true },
  });

  if (!conversation || conversation.inbox.accountId !== session.accountId) {
    return { canAccess: false, agent: null };
  }

  const agent = await prisma.agent.findUnique({ where: { id: session.sub } });
  return { canAccess: Boolean(agent), agent };
}
