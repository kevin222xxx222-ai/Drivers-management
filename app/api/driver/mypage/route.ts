import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { getDriverPageState } from "@/lib/driver-service";

export async function GET() {
  try {
    const user = await requireDriver();
    return NextResponse.json(await getDriverPageState(user.driver));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}
