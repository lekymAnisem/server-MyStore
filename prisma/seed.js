const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@mystore.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@mystore.com',
      password: adminPassword,
      role: 'ADMIN',
      isVerified: true,
    },
  });

  const categories = [
    { name: 'Electronics', slug: 'electronics', description: 'Electronic devices and accessories' },
    { name: 'Fashion', slug: 'fashion', description: 'Clothing, shoes, and accessories' },
    { name: 'Home & Living', slug: 'home-living', description: 'Home decor and furniture' },
    { name: 'Beauty', slug: 'beauty', description: 'Beauty and personal care' },
    { name: 'Sports', slug: 'sports', description: 'Sports equipment and gear' },
    { name: 'Food & Drinks', slug: 'food-drinks', description: 'Food and beverages' },
    { name: 'Books', slug: 'books', description: 'Books and stationery' },
    { name: 'Toys', slug: 'toys', description: 'Toys and games' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log('Seed completed: Admin user and categories created.');
  console.log('Admin email: admin@mystore.com');
  console.log('Admin password: admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
