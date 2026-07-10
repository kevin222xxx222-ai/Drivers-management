import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { success: false, error: "ログアウト種別を指定してください。" },
    { status: 400 }
  );
}
