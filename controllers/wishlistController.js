const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getWishlist = async (req, res) => {
  try {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: req.user.id },
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
    });

    if (!wishlist) {
      return res.json({ items: [] });
    }

    res.json({
      ...wishlist,
      items: wishlist.items.map((i) => ({
        ...i,
        product: { ...i.product, image: i.product.images[0]?.imageUrl || null, images: undefined },
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    let wishlist = await prisma.wishlist.findUnique({ where: { userId: req.user.id } });
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({ data: { userId: req.user.id } });
    }

    const existing = await prisma.wishlistItem.findFirst({
      where: { wishlistId: wishlist.id, productId },
    });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      res.json({ message: 'Removed from wishlist.', isWishlisted: false });
    } else {
      await prisma.wishlistItem.create({
        data: { wishlistId: wishlist.id, productId },
      });
      res.json({ message: 'Added to wishlist.', isWishlisted: true });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.wishlistItem.delete({ where: { id } });
    res.json({ message: 'Removed from wishlist.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
