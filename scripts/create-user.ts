// One-off CLI bootstrap for the very first login account — the in-app
// "จัดการพนักงาน" admin page (src/app/(app)/admin/employees) needs an
// existing admin to already be logged in before it can create anyone else,
// so this script exists purely to break that chicken-and-egg problem.
//
// Usage: npx tsx scripts/create-user.ts <username> <password> <displayName> [ADMIN|STAFF]
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [username, password, displayName, roleArg] = process.argv.slice(2);
  if (!username || !password || !displayName) {
    console.error("Usage: npx tsx scripts/create-user.ts <username> <password> <displayName> [ADMIN|STAFF]");
    process.exit(1);
  }
  const role = roleArg === "STAFF" ? UserRole.STAFF : UserRole.ADMIN;

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, displayName, role, isActive: true },
    create: { username, passwordHash, displayName, role },
  });
  console.log(`OK: ${user.role} account "${user.username}" (${user.displayName}) is ready.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
