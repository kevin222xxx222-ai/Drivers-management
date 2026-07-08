import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const adminId = String(body.adminId ?? "").trim();
  const password = String(body.password ?? "");
  const admin = await prisma.admin.findUnique({ where: { adminId } });
  if (!admin?.isActive || !verifyPassword(password, admin.passwordHash)) {
    return NextResponse.json({ success: false, error: "ログイン情報が正しくありません。" }, { status: 401 });
  }
  await createSession("ADMIN", admin.id);
  return NextResponse.json({ success: true, userType: "ADMIN", adminId: admin.adminId });
}
