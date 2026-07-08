import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "driver_app_session";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userType: "DRIVER" | "ADMIN", userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const keepDays = userType === "DRIVER" ? 30 : 7;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * keepDays);
  await prisma.session.create({
    data: {
      userType,
      userId,
      sessionTokenHash: hashToken(token),
      expiresAt
    }
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { sessionTokenHash: hashToken(token), isActive: true },
      data: { isActive: false, logoutAt: new Date() }
    });
  }
  cookies().delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: hashToken(token) }
  });
  if (!session || !session.isActive) return null;
  if (session.expiresAt && session.expiresAt < new Date()) return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { lastAccessAt: new Date() }
  });

  if (session.userType === "DRIVER") {
    const driver = await prisma.driver.findUnique({ where: { id: session.userId } });
    if (!driver?.isActive) return null;
    return { session, userType: "DRIVER" as const, driver };
  }

  const admin = await prisma.admin.findUnique({ where: { id: session.userId } });
  if (!admin?.isActive) return null;
  return { session, userType: "ADMIN" as const, admin };
}

export async function requireDriver() {
  const user = await getSessionUser();
  if (!user || user.userType !== "DRIVER") throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.userType !== "ADMIN") throw new Response("Unauthorized", { status: 401 });
  return user;
}
