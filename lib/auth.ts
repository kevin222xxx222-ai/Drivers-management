import crypto from "crypto";
import { cookies } from "next/headers";
import { noStoreHeaders } from "./http";
import { prisma } from "./prisma";

export const LEGACY_SESSION_COOKIE = "driver_app_session";
export const DRIVER_SESSION_COOKIE = "driver_session";
export const ADMIN_SESSION_COOKIE = "admin_session";
const LEGACY_DRIVER_SESSION_COOKIE = "driver_app_driver_session";
const LEGACY_ADMIN_SESSION_COOKIE = "driver_app_admin_session";
const DRIVER_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userType: "DRIVER" | "ADMIN", userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const keepDays = userType === "DRIVER" ? 30 : 7;
  const maxAge = userType === "DRIVER" ? DRIVER_SESSION_MAX_AGE : ADMIN_SESSION_MAX_AGE;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * keepDays);
  await prisma.session.create({
    data: {
      userType,
      userId,
      sessionTokenHash: hashToken(token),
      expiresAt
    }
  });
  cookies().set(cookieNameForUserType(userType), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    expires: expiresAt
  });
}

export async function destroySession(userType: "DRIVER" | "ADMIN") {
  const cookieNames = cookieNamesForUserType(userType);
  const tokens = cookieNames
    .map((name) => cookies().get(name)?.value)
    .filter((token): token is string => Boolean(token));
  if (tokens.length) {
    await prisma.session.updateMany({
      where: { sessionTokenHash: { in: tokens.map(hashToken) }, userType, isActive: true },
      data: { isActive: false, logoutAt: new Date() }
    });
  }
  cookieNames.forEach((name) => cookies().delete(name));
}

export async function getSessionUser(preferredType?: "DRIVER" | "ADMIN") {
  const token = sessionTokenFor(preferredType);
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
    if (!driver?.isActive || driver.deletedAt) return null;
    return { session, userType: "DRIVER" as const, driver };
  }

  const admin = await prisma.admin.findUnique({ where: { id: session.userId } });
  if (!admin?.isActive) return null;
  return { session, userType: "ADMIN" as const, admin };
}

export async function requireDriver() {
  const user = await getSessionUser("DRIVER");
  if (!user || user.userType !== "DRIVER") throw unauthorized("ドライバーのログインが切れています。再ログインしてください。");
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser("ADMIN");
  if (!user || user.userType !== "ADMIN") throw unauthorized("管理者のログインが切れています。再ログインしてください。");
  return user;
}

function cookieNameForUserType(userType: "DRIVER" | "ADMIN") {
  return userType === "DRIVER" ? DRIVER_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
}

function cookieNamesForUserType(userType: "DRIVER" | "ADMIN") {
  return userType === "DRIVER"
    ? [DRIVER_SESSION_COOKIE, LEGACY_DRIVER_SESSION_COOKIE]
    : [ADMIN_SESSION_COOKIE, LEGACY_ADMIN_SESSION_COOKIE];
}

function sessionTokenFor(preferredType?: "DRIVER" | "ADMIN") {
  if (preferredType) {
    for (const name of cookieNamesForUserType(preferredType)) {
      const token = cookies().get(name)?.value;
      if (token) return token;
    }
    return undefined;
  }
  return cookies().get(ADMIN_SESSION_COOKIE)?.value
    ?? cookies().get(DRIVER_SESSION_COOKIE)?.value
    ?? cookies().get(LEGACY_ADMIN_SESSION_COOKIE)?.value
    ?? cookies().get(LEGACY_DRIVER_SESSION_COOKIE)?.value
    ?? cookies().get(LEGACY_SESSION_COOKIE)?.value;
}

function unauthorized(message: string) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 401,
    headers: { "content-type": "application/json", ...noStoreHeaders }
  });
}
