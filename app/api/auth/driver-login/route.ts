import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/http";

export async function POST(request: Request) {
  const body = await request.json();
  const driverId = String(body.driverId ?? "").trim();
  const pin = String(body.pin ?? "");
  const driver = driverId ? await prisma.driver.findUnique({ where: { id: driverId } }) : null;
  if (!driver?.isActive || driver.deletedAt || !verifyPassword(pin, driver.pinHash)) {
    return NextResponse.json({ success: false, error: "ログイン情報が正しくありません。" }, { status: 401, headers: noStoreHeaders });
  }
  await createSession("DRIVER", driver.id);
  return NextResponse.json({ success: true, userType: "DRIVER", driverName: driver.driverName }, { headers: noStoreHeaders });
}
