import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { createDriverLog } from "@/lib/driver-service";

export async function POST(request: Request) {
  try {
    const user = await requireDriver();
    const input = await request.json();
    const log = await createDriverLog({
      driver: user.driver,
      actor: { userType: "DRIVER", userId: user.driver.id },
      input
    });
    return NextResponse.json({ success: true, log });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 400 });
  }
}
