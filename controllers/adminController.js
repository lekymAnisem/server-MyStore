const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboard = async (req, res) => {
  try {
    const [
      totalUsers, totalMerchants, totalProducts, totalOrders,
      totalRevenue, recentOrders, pendingMerchants,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.merchant.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { totalAmount: true } }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          buyer: { select: { name: true } },
          items: { include: { product: { select: { name: true } } }, take: 1 },
        },
      }),
      prisma.merchant.count({ where: { isApproved: false } }),
    ]);

    const monthlySales = await prisma.$queryRaw`
      SELECT DATE_TRUNC('month', "createdAt") as month, SUM("totalAmount") as revenue
      FROM "Order"
      WHERE status = 'DELIVERED' AND "createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month
    `;

    const ordersByStatus = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    res.json({
      totalUsers,
      totalMerchants,
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      monthlySales,
      ordersByStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count.id })),
      recentOrders,
      pendingMerchants,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getMerchants = async (req, res) => {
  try {
    const { page = 1, limit = 20, isApproved } = req.query;
    const where = {};
    if (isApproved !== undefined) where.isApproved = isApproved === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.merchant.count({ where }),
    ]);

    res.json({
      merchants,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, price: true } } } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive } = req.query;
    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          merchant: { select: { storeName: true } },
          category: { select: { name: true } },
          images: { where: { isPrimary: true }, take: 1 },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const updateData = { status };
    if (status === 'PAID') updateData.paidAt = new Date();
    if (status === 'SHIPPED') updateData.shippedAt = new Date();
    if (status === 'DELIVERED') updateData.deliveredAt = new Date();
    if (status === 'CANCELLED') updateData.cancelledAt = new Date();

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    await prisma.notification.create({
      data: {
        userId: order.buyerId,
        title: `Order ${status}`,
        message: `Your order #${order.orderNumber} has been updated to ${status}.`,
        orderId: order.id,
        type: 'INFO',
      },
    });

    res.json({ message: 'Order status updated.', order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.approveMerchant = async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    const merchant = await prisma.merchant.update({
      where: { id },
      data: { isApproved },
    });

    await prisma.notification.create({
      data: {
        userId: merchant.userId,
        title: isApproved ? 'Merchant Approved' : 'Merchant Rejected',
        message: isApproved
          ? 'Your merchant application has been approved. You can now start selling.'
          : 'Your merchant application has been rejected.',
        type: 'INFO',
      },
    });

    res.json({ message: `Merchant ${isApproved ? 'approved' : 'rejected'}.`, merchant });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
