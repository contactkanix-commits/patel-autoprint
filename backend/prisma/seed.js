const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function main() {
  // --- Deduplicate shops if multiple exist (fix from old buggy seed) ---
  const shops = await prisma.shop.findMany({ orderBy: { createdAt: 'asc' } });
  if (shops.length > 1) {
    console.log(`Found ${shops.length} shops. Merging into one...`);
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@patelautoprint.com' } });
    const keepShopId = adminUser ? adminUser.shopId : shops[0].id;
    const removeIds = shops.filter(s => s.id !== keepShopId).map(s => s.id);

    const usersToMove = await prisma.user.findMany({ where: { shopId: { in: removeIds } } });
    for (const u of usersToMove) {
      const dup = await prisma.user.findUnique({ where: { shopId_email: { shopId: keepShopId, email: u.email } } });
      if (!dup) {
        await prisma.user.update({ where: { id: u.id }, data: { shopId: keepShopId } });
      } else {
        await prisma.user.delete({ where: { id: u.id } });
      }
    }

    await prisma.customer.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });
    await prisma.printer.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });
    await prisma.pricingRule.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });

    const maxToken = await prisma.order.findFirst({ where: { shopId: keepShopId }, orderBy: { token: 'desc' } });
    let nextToken = (maxToken?.token || 0) + 1;
    for (const sid of removeIds) {
      const orders = await prisma.order.findMany({ where: { shopId: sid }, orderBy: { token: 'asc' } });
      for (const o of orders) {
        await prisma.order.update({ where: { id: o.id }, data: { shopId: keepShopId, token: nextToken++ } });
      }
    }

    await prisma.orderFile.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });
    await prisma.printJob.updateMany({ where: { shopId: { in: removeIds } }, data: { shopId: keepShopId } });
    await prisma.shop.deleteMany({ where: { id: { in: removeIds } } });
    console.log(`Merged into shop ${keepShopId}. Removed ${removeIds.length} duplicate(s).`);
  }

  // Skip seeding if data already exists
  if (shops.length > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database...');

  // Create default plans
  const basicPlan = await prisma.plan.create({
    data: {
      name: 'Basic',
      priceMonthly: 99900, // ₹999
      priceYearly: 999900, // ₹9,999
      maxOrders: 500,
      maxPrinters: 2,
      maxStaff: 3,
      features: { whatsapp: false, analytics: true, api: false },
    },
  });

  await prisma.plan.create({
    data: {
      name: 'Pro',
      priceMonthly: 249900, // ₹2,499
      priceYearly: 2499900, // ₹24,999
      maxOrders: 2000,
      maxPrinters: 5,
      maxStaff: 10,
      features: { whatsapp: true, analytics: true, api: true },
    },
  });

  await prisma.plan.create({
    data: {
      name: 'Enterprise',
      priceMonthly: 499900, // ₹4,999
      priceYearly: 4999900, // ₹49,999
      maxOrders: 99999,
      maxPrinters: 99,
      maxStaff: 99,
      features: { whatsapp: true, analytics: true, api: true },
    },
  });

  console.log('Plans created');

  // Create demo shop
  const activationKey = `PATEL-${uuidv4().substring(0, 8).toUpperCase()}`;
  const shop = await prisma.shop.create({
    data: {
      name: 'Patel AutoPrint',
      ownerName: 'Mayank Patel',
      mobile: '9876543210',
      email: 'admin@patelautoprint.com',
      address: '123 Print Street',
      city: 'Ahmedabad',
      state: 'Gujarat',
      activationKey,
      planId: basicPlan.id,
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      isActivated: true,
      activatedAt: new Date(),
      settings: { currency: 'INR', timeZone: 'Asia/Kolkata' },
    },
  });

  console.log(`Shop created: ${shop.name} (${shop.id})`);
  console.log(`Activation Key: ${activationKey}`);

  // Create shop owner
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Mayank Patel',
      email: 'admin@patelautoprint.com',
      passwordHash,
      role: 'OWNER',
    },
  });

  // Create manager
  const managerHash = await bcrypt.hash('manager123', 10);
  await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Rahul Sharma',
      email: 'manager@patelautoprint.com',
      passwordHash: managerHash,
      role: 'MANAGER',
    },
  });

  // Create operator
  const operatorHash = await bcrypt.hash('operator123', 10);
  await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Priya Kumar',
      email: 'operator@patelautoprint.com',
      passwordHash: operatorHash,
      role: 'OPERATOR',
    },
  });

  console.log('Users created');

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
      isDefault: true,
      priority: 1,
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
      priority: 2,
    },
  });

  console.log('Printers created');

  // Create pricing rule
  await prisma.pricingRule.create({
    data: {
      shopId: shop.id,
      name: 'Default',
      bwPerPage: 2,
      colorPerPage: 10,
      colorDuplexPerPage: 20,
      taxRate: 18,
    },
  });

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

  // Create default agent
  await prisma.agent.create({
    data: {
      shopId: shop.id,
      machineName: 'COUNTER-1',
      machineId: uuidv4(),
      apiKey: uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''),
      isActive: true,
    },
  });

  console.log('Default agent created');

  console.log('\n✓ Database seeded successfully!');
  console.log('\nDemo credentials:');
  console.log('  Owner:    admin@patelautoprint.com / admin123');
  console.log('  Manager:  manager@patelautoprint.com / manager123');
  console.log('  Operator: operator@patelautoprint.com / operator123');
  console.log(`\n  Shop Activation Key: ${activationKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
