const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createVoucher = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const { code, type, discountValue, minPurchase, maxDiscount, usageLimit, expiresAt } = req.body;

    const existing = await prisma.voucher.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Voucher code already exists.' });
    }

    const voucher = await prisma.voucher.create({
      data: {
        merchantId: merchant.id,
        code,
        type,
        discountValue: parseFloat(discountValue),
        minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        expiresAt: new Date(expiresAt),
      },
    });

    res.status(201).json(voucher);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getMerchantVouchers = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const vouchers = await prisma.voucher.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(vouchers);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getActiveVouchers = async (req, res) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      where: {
        isActive: true,
        expiresAt: { gte: new Date() },
        AND: [
          { usageLimit: null },
          { OR: [{ usageLimit: null }, { usedCount: { lt: prisma.voucher.fields.usageLimit } }] },
        ],
      },
      include: {
        merchant: { select: { storeName: true, logo: true } },
      },
      take: 20,
    });

    res.json(vouchers);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const voucher = await prisma.voucher.update({
      where: { id },
      data: { isActive },
    });

    res.json(voucher);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
