import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(request: Request) {
  const key = clientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json({ success: false, error: "ログイン情報が正しくありません。" }, { status: 429 });
  }
  const body = await request.json();
  const adminId = String(body.adminId ?? "").trim();
  const password = String(body.password ?? "");
  const admin = await prisma.admin.findUnique({ where: { adminId } });
  if (!admin?.isActive || !verifyPassword(password, admin.passwordHash)) {
    recordFailedAttempt(key);
    return NextResponse.json({ success: false, error: "ログイン情報が正しくありません。" }, { status: 401 });
  }
  attempts.delete(key);
  await createSession("ADMIN", admin.id);
  return NextResponse.json({ success: true, userType: "ADMIN", adminId: admin.adminId });
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isRateLimited(key: string) {
  const current = attempts.get(key);
  if (!current) return false;
  if (Date.now() > current.resetAt) {
    attempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now > current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  attempts.set(key, { count: current.count + 1, resetAt: current.resetAt });
}
