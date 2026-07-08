import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const driverName = String(body.driverName ?? "").trim();
  const pin = String(body.pin ?? "");
  const driver = await prisma.driver.findUnique({ where: { driverName } });
  if (!driver?.isActive || !verifyPassword(pin, driver.pinHash)) {
    return NextResponse.json({ success: false, error: "ログイン情報が正しくありません。" }, { status: 401 });
  }
  await createSession("DRIVER", driver.id);
  return NextResponse.json({ success: true, userType: "DRIVER", driverName: driver.driverName });
}
