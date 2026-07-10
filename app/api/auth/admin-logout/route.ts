import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  await destroySession("ADMIN");
  return NextResponse.json({ success: true });
}
