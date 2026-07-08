import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  if (user.userType === "DRIVER") {
    return NextResponse.json({ userType: "DRIVER", driver: user.driver });
  }
  return NextResponse.json({ userType: "ADMIN", admin: user.admin });
}
