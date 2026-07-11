import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/http";

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  const preferredType = type === "DRIVER" || type === "ADMIN" ? type : undefined;
  const user = await getSessionUser(preferredType);
  if (!user) return NextResponse.json({ authenticated: false, user: null }, { status: 401, headers: noStoreHeaders });
  if (user.userType === "DRIVER") {
    return NextResponse.json({ authenticated: true, userType: "DRIVER", driver: user.driver }, { headers: noStoreHeaders });
  }
  return NextResponse.json({ authenticated: true, userType: "ADMIN", admin: user.admin }, { headers: noStoreHeaders });
}
