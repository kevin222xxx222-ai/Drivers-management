import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  await prisma.admin.upsert({
    where: { adminId: "admin" },
    update: { passwordHash: hashPassword("password"), isActive: true },
    create: {
      adminId: "admin",
      passwordHash: hashPassword("password"),
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
        pinHash: hashPassword("1234"),
        isActive: true,
        displayOrder: driver.displayOrder,
        hourlyWage: 1200
      },
      create: {
        ...driver,
        pinHash: hashPassword("1234"),
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
