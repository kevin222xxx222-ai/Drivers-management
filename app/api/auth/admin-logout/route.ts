import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/http";

export async function POST() {
  await destroySession("ADMIN");
  return NextResponse.json({ success: true }, { headers: noStoreHeaders });
}
