const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
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
    { name: 'Standard B/W', bwRate: 2, colorRate: 10, duplexDiscount: 20, nupDiscount: 15, taxRate: 18 },
    { name: 'Premium Color', bwRate: 5, colorRate: 15, duplexDiscount: 15, nupDiscount: 10, taxRate: 18 },
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
