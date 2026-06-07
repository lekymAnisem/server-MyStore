const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    const existing = await prisma.review.findFirst({
      where: { userId: req.user.id, productId },
    });

    if (existing) {
      return res.status(400).json({ message: 'You already reviewed this product.' });
    }

    const hasOrdered = await prisma.order.findFirst({
      where: {
        buyerId: req.user.id,
        status: 'DELIVERED',
        items: { some: { productId } },
      },
    });

    if (!hasOrdered) {
      return res.status(400).json({ message: 'You must purchase this product first.' });
    }

    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map((f) => f.path);
    }

    const review = await prisma.review.create({
      data: {
        userId: req.user.id,
        productId,
        rating: parseInt(rating),
        comment,
        images,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const reviews = await prisma.review.findMany({
      where: { productId },
      select: { rating: true },
    });

    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await prisma.product.update({
      where: { id: productId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        numReviews: reviews.length,
      },
    });

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { productId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.review.count({ where: { productId } }),
    ]);

    res.json({
      reviews,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.replyToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    const review = await prisma.review.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (review.product.merchantId !== merchant.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: { reply },
      include: { user: { select: { id: true, name: true } } },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    if (review.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    await prisma.review.delete({ where: { id } });

    const reviews = await prisma.review.findMany({
      where: { productId: review.productId },
      select: { rating: true },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    await prisma.product.update({
      where: { id: review.productId },
      data: { rating: Math.round(avgRating * 10) / 10, numReviews: reviews.length },
    });

    res.json({ message: 'Review deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
