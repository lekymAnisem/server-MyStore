const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboard = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const [
      totalProducts, totalOrders, totalRevenue, pendingOrders,
      ordersByStatus,
    ] = await Promise.all([
      prisma.product.count({ where: { merchantId: merchant.id, isActive: true } }),
      prisma.order.count({
        where: { items: { some: { product: { merchantId: merchant.id } } } },
      }),
      prisma.order.aggregate({
        where: { status: 'DELIVERED', items: { some: { product: { merchantId: merchant.id } } } },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({
        where: { status: 'PENDING', items: { some: { product: { merchantId: merchant.id } } } },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { items: { some: { product: { merchantId: merchant.id } } } },
        _count: { id: true },
      }),
    ]);

    const monthlySales = await prisma.$queryRaw`
      SELECT DATE_TRUNC('month', o."createdAt") as month, SUM(o."totalAmount") as revenue
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      JOIN "Product" p ON p.id = oi."productId"
      WHERE p."merchantId" = ${merchant.id} AND o.status = 'DELIVERED'
      AND o."createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month
    `;

    const topProducts = await prisma.product.findMany({
      where: { merchantId: merchant.id },
      orderBy: { sold: 'desc' },
      take: 5,
      include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
    });

    res.json({
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      pendingOrders,
      availableBalance: merchant.availableBalance,
      totalEarnings: merchant.totalEarnings,
      ordersByStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count.id })),
      monthlySales,
      topProducts: topProducts.map((p) => ({ ...p, image: p.images[0]?.imageUrl || null, images: undefined })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getStore = async (req, res) => {
  try {
    const { slug } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { storeSlug: slug },
      include: {
        _count: { select: { products: true } },
        user: { select: { name: true } },
      },
    });

    if (!merchant) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    const products = await prisma.product.findMany({
      where: { merchantId: merchant.id, isActive: true },
      include: {
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
        _count: { select: { reviews: true } },
      },
      orderBy: { sold: 'desc' },
      take: 20,
    });

    res.json({
      merchant: {
        ...merchant,
        user: undefined,
        ownerName: merchant.user.name,
      },
      products: products.map((p) => ({
        ...p,
        image: p.images[0]?.imageUrl || null,
        images: undefined,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const { storeName, description, phone } = req.body;

    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const data = {};
    if (storeName) data.storeName = storeName;
    if (description !== undefined) data.description = description;
    if (phone) data.phone = phone;

    const updated = await prisma.merchant.update({
      where: { id: merchant.id },
      data,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
