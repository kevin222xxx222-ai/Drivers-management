import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { getDriverPageState } from "@/lib/driver-service";
import { noStoreHeaders } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireDriver();
    return NextResponse.json(await getDriverPageState(user.driver), { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500, headers: noStoreHeaders });
  }
}
