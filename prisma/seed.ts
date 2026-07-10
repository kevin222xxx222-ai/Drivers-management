import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const driverPin = process.env.SEED_DRIVER_PIN;
  if (!adminPassword) throw new Error("SEED_ADMIN_PASSWORD を設定してください。");
  if (!driverPin) throw new Error("SEED_DRIVER_PIN を設定してください。");

  await prisma.admin.upsert({
    where: { adminId: "admin" },
    update: { isActive: true },
    create: {
      adminId: "admin",
      passwordHash: hashPassword(adminPassword),
      isActive: true
    }
  });

  const drivers = [
    { driverName: "高野", displayOrder: 1 },
    { driverName: "佐藤", displayOrder: 2 }
  ];

  for (const driver of drivers) {
    await prisma.driver.upsert({
      where: { driverName: driver.driverName },
      update: {
        isActive: true,
        displayOrder: driver.displayOrder,
        hourlyWage: 1200
      },
      create: {
        ...driver,
        pinHash: hashPassword(driverPin),
        hourlyWage: 1200,
        gasSettlementType: "INCLUDED"
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
