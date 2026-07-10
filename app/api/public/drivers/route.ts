import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const drivers = await prisma.driver.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, driverName: true },
    orderBy: [{ displayOrder: "asc" }, { driverName: "asc" }]
  });
  return NextResponse.json(drivers);
}
