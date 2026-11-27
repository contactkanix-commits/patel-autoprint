const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Read new password from env or use default
  const newPassword = process.env.RESET_SUPER_ADMIN_PASSWORD || 'superadmin123';

  const superAdminEmail = 'superadmin@patelautoprint.com';

  // Find the super admin
  const admin = await prisma.user.findFirst({
    where: { email: superAdminEmail, role: 'SUPER_ADMIN' },
  });

  if (!admin) {
    console.log(`No SUPER_ADMIN found with email ${superAdminEmail}. Creating one...`);
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.create({
      data: {
        shopId: null,
        email: superAdminEmail,
        passwordHash: hash,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
      },
    });
    console.log(`Super admin created: ${superAdminEmail}`);
  } else {
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: hash },
    });
    console.log(`Super admin password reset: ${superAdminEmail}`);
  }

  console.log(`New password: ${newPassword}`);
  console.log('You can now log in to the superadmin panel.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
