const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const generateOrderNumber = () => {
  const prefix = 'MST';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, notes, voucherCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    let totalAmount = 0;
    let discount = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found.` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}.` });
      }
      const price = product.salePrice || product.price;
      totalAmount += price * item.quantity;
    }

    if (voucherCode) {
      const voucher = await prisma.voucher.findUnique({
        where: { code: voucherCode },
        include: { merchant: true },
      });

      if (voucher && voucher.isActive && voucher.expiresAt > new Date()) {
        if (totalAmount >= voucher.minPurchase) {
          if (voucher.type === 'PERCENTAGE') {
            const maxDisc = voucher.maxDiscount || Infinity;
            discount = Math.min(totalAmount * (voucher.discountValue / 100), maxDisc);
          } else if (voucher.type === 'FIXED') {
            discount = voucher.discountValue;
          }
        }
      }
    }

    const orderNumber = generateOrderNumber();
    const shippingFee = totalAmount >= 500 ? 0 : 40;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        buyerId: req.user.id,
        totalAmount,
        shippingFee,
        discount,
        paymentMethod,
        shippingAddress,
        notes,
        paymentStatus: paymentMethod === 'COD' ? 'UNPAID' : 'PENDING',
        items: {
          create: items.map((item) => {
            const product = productMap.get(item.productId);
            return {
              productId: item.productId,
              quantity: item.quantity,
              price: product.salePrice || product.price,
              variation: item.variation,
            };
          }),
        },
      },
      include: { items: true },
    });

    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } },
      });
    }

    await prisma.cartItem.deleteMany({
      where: {
        cart: { userId: req.user.id },
        productId: { in: productIds },
      },
    });

    const notificationPromises = items.map(async (item) => {
      const product = productMap.get(item.productId);
      const merchant = await prisma.merchant.findUnique({
        where: { id: product.merchantId },
      });
      if (merchant) {
        await prisma.notification.create({
          data: {
            userId: merchant.userId,
            orderId: order.id,
            title: 'New Order',
            message: `You have a new order #${orderNumber}`,
            type: 'ORDER',
          },
        });
      }
    });
    await Promise.all(notificationPromises);

    res.status(201).json({ message: 'Order placed successfully.', order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const where = { buyerId: req.user.id };
    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                  merchant: { select: { storeName: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders: orders.map((o) => ({
        ...o,
        items: o.items.map((i) => ({
          ...i,
          product: { ...i.product, image: i.product.images[0]?.imageUrl || null },
        })),
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        buyer: {
          include: { addresses: true },
        },
        items: {
          include: {
            product: {
              include: { images: { orderBy: { sortOrder: 'asc' } }, merchant: true },
            },
          },
        },
      },
    });

    if (!order || (order.buyerId !== req.user.id && req.user.role !== 'ADMIN')) {
      const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
      if (!merchant || order.items.some((i) => i.product.merchantId !== merchant.id)) {
        return res.status(404).json({ message: 'Order not found.' });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const data = { status };

    if (status === 'SHIPPED' && trackingNumber) {
      data.trackingNumber = trackingNumber;
      data.shippedAt = new Date();
    } else if (status === 'DELIVERED') {
      data.deliveredAt = new Date();
      data.paymentStatus = 'PAID';
    } else if (status === 'CANCELLED') {
      data.cancelledAt = new Date();

      for (const item of order.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }, sold: { decrement: item.quantity } },
        });
      }
    }

    await prisma.order.update({ where: { id }, data });

    await prisma.notification.create({
      data: {
        userId: order.buyerId,
        orderId: order.id,
        title: 'Order Update',
        message: `Order #${order.orderNumber} is now ${status.toLowerCase()}.`,
        type: 'ORDER',
      },
    });

    res.json({ message: 'Order updated.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getMerchantOrders = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const { status, page = 1, limit = 10 } = req.query;

    const where = {
      items: { some: { product: { merchantId: merchant.id } } },
    };
    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            where: { product: { merchantId: merchant.id } },
            include: {
              product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
            },
          },
          buyer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
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

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order || order.buyerId !== req.user.id) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (!['PENDING', 'PAID'].includes(order.status)) {
      return res.status(400).json({ message: 'Order cannot be cancelled.' });
    }

    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity }, sold: { decrement: item.quantity } },
      });
    }

    await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    res.json({ message: 'Order cancelled.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
