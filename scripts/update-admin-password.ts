import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

async function main() {
  const newPassword = process.env.ADMIN_NEW_PASSWORD;
  if (!newPassword) throw new Error("ADMIN_NEW_PASSWORD を設定してください。");
  if (newPassword.length < 12) throw new Error("ADMIN_NEW_PASSWORD は12文字以上にしてください。");

  const admin = await prisma.admin.findUnique({ where: { adminId: "admin" } });
  if (!admin) throw new Error("管理者 admin が見つかりません。");

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: hashPassword(newPassword) }
    }),
    prisma.session.updateMany({
      where: { userType: "ADMIN", isActive: true },
      data: { isActive: false, logoutAt: new Date() }
    })
  ]);

  console.log("管理者パスワードを更新しました。");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "管理者パスワード更新に失敗しました。");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
