import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  await destroySession("DRIVER");
  return NextResponse.json({ success: true });
}
