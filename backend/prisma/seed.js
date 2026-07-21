const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // --- Deduplicate shops if multiple exist (fix from old buggy seed) ---
  const shops = await prisma.shop.findMany({ orderBy: { createdAt: 'asc' } });
  if (shops.length > 1) {
    console.log(`Found ${shops.length} shops. Merging into one...`);
    // Keep the shop with the admin user; fallback to the first shop
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@patelautoprint.com' } });
    const keepShopId = adminUser ? adminUser.shopId : shops[0].id;
    const removeIds = shops.filter(s => s.id !== keepShopId).map(s => s.id);

    // 1. Move users (skip if email already exists in target shop)
    const usersToMove = await prisma.user.findMany({ where: { shopId: { in: removeIds } } });
    for (const u of usersToMove) {
      const dup = await prisma.user.findUnique({ where: { shopId_email: { shopId: keepShopId, email: u.email } } });
      if (!dup) {
        await prisma.user.update({ where: { id: u.id }, data: { shopId: keepShopId } });
      } else {
        await prisma.user.delete({ where: { id: u.id } }); // duplicate user, remove
      }
    }

    // 2. Move customers
    await prisma.customer.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });

    // 3. Move printers
    await prisma.printer.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });

    // 4. Move pricing rules
    await prisma.pricingRule.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });

    // 5. Move orders — handle token uniqueness (shopId + token)
    const maxToken = await prisma.order.findFirst({ where: { shopId: keepShopId }, orderBy: { token: 'desc' } });
    let nextToken = (maxToken?.token || 0) + 1;
    for (const sid of removeIds) {
      const orders = await prisma.order.findMany({ where: { shopId: sid }, orderBy: { token: 'asc' } });
      for (const o of orders) {
        await prisma.order.update({ where: { id: o.id }, data: { shopId: keepShopId, token: nextToken++ } });
      }
    }

    // 6. Move order files and print jobs (their parent orders are now in keepShopId)
    await prisma.orderFile.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });
    await prisma.printJob.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });

    // 7. Delete empty shops
    await prisma.shop.deleteMany({ where: { id: { in: removeIds } } });
    console.log(`Merged into shop ${keepShopId}. Removed ${removeIds.length} duplicate(s).`);
  }

  // Skip seeding if data already exists (idempotent — safe to run on every restart)
  if (shops.length > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database...');

  // Create a demo shop
  const shop = await prisma.shop.create({
    data: {
      name: 'Patel AutoPrint',
      settings: {
        currency: 'INR',
        timeZone: 'Asia/Kolkata',
      },
    },
  });

  console.log(`Shop created: ${shop.name} (${shop.id})`);

  // Create shop owner
  const passwordHash = await bcrypt.hash('admin123', 10);
  const owner = await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Mayank Patel',
      email: 'admin@patelautoprint.com',
      passwordHash,
      role: 'OWNER',
    },
  });

  console.log(`Owner created: ${owner.name} (${owner.email})`);

  // Create manager
  const managerHash = await bcrypt.hash('manager123', 10);
  const manager = await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Rahul Sharma',
      email: 'manager@patelautoprint.com',
      passwordHash: managerHash,
      role: 'MANAGER',
    },
  });

  console.log(`Manager created: ${manager.name}`);

  // Create operator
  const operatorHash = await bcrypt.hash('operator123', 10);
  const operator = await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Priya Kumar',
      email: 'operator@patelautoprint.com',
      passwordHash: operatorHash,
      role: 'OPERATOR',
    },
  });

  console.log(`Operator created: ${operator.name}`);

  // Create printers
  await prisma.printer.create({
    data: {
      shopId: shop.id,
      name: 'Canon iR-ADV 6575',
      ip: '192.168.1.100',
      paperSizes: ['A4', 'A3', 'Legal', 'Letter'],
      colorSupport: false,
      duplexSupport: true,
      status: 'ONLINE',
    },
  });

  await prisma.printer.create({
    data: {
      shopId: shop.id,
      name: 'Konica Bizhub C450i',
      ip: '192.168.1.101',
      paperSizes: ['A4', 'A3'],
      colorSupport: true,
      duplexSupport: true,
      status: 'ONLINE',
    },
  });

  console.log('Printers created');

  // Create pricing rules
  const pricingRules = [
    { name: 'Standard B/W', bwPerPage: 2, colorPerPage: 10, colorDuplexPerPage: 20, taxRate: 18 },
    { name: 'Premium Color', bwPerPage: 5, colorPerPage: 15, colorDuplexPerPage: 30, taxRate: 18 },
  ];

  for (const rule of pricingRules) {
    await prisma.pricingRule.create({
      data: {
        shopId: shop.id,
        ...rule,
      },
    });
  }

  console.log('Pricing rules created');

  // Create demo customers
  const customers = [
    { name: 'Amit Patel', phone: '9876543220', email: 'amit@example.com' },
    { name: 'Sneha Shah', phone: '9876543221', email: 'sneha@example.com' },
    { name: 'Rajesh Kumar', phone: '9876543222', email: 'rajesh@example.com' },
  ];

  for (const customer of customers) {
    await prisma.customer.create({
      data: {
        shopId: shop.id,
        ...customer,
      },
    });
  }

  console.log('Customers created');

  console.log('\n✓ Database seeded successfully!');
  console.log('\nDemo credentials:');
  console.log('  Owner:    admin@patelautoprint.com / admin123');
  console.log('  Manager:  manager@patelautoprint.com / manager123');
  console.log('  Operator: operator@patelautoprint.com / operator123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
