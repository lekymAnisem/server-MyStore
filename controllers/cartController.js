const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getCart = async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { sortOrder: 'asc' } },
                merchant: { select: { id: true, storeName: true, storeSlug: true } },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      return res.json({ items: [], total: 0 });
    }

    const items = cart.items.map((item) => ({
      ...item,
      product: {
        ...item.product,
        image: item.product.images[0]?.imageUrl || null,
        images: undefined,
      },
    }));

    const total = items.reduce((sum, item) => {
      const price = item.product.salePrice || item.product.price;
      return sum + price * item.quantity;
    }, 0);

    res.json({ ...cart, items, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, variation } = req.body;

    const product = await prisma.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock.' });
    }

    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (!cart) {
      const newCart = await prisma.cart.create({ data: { userId: req.user.id } });
      await prisma.cartItem.create({
        data: { cartId: newCart.id, productId, quantity, variation },
      });
      return res.status(201).json({ message: 'Added to cart.' });
    }

    const existingItem = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId, variation: variation || null },
    });

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > product.stock) {
        return res.status(400).json({ message: 'Insufficient stock.' });
      }
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity, variation },
      });
    }

    res.status(201).json({ message: 'Added to cart.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const item = await prisma.cartItem.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found.' });
    }

    if (quantity > item.product.stock) {
      return res.status(400).json({ message: 'Insufficient stock.' });
    }

    if (quantity <= 0) {
      await prisma.cartItem.delete({ where: { id } });
      return res.json({ message: 'Item removed.' });
    }

    await prisma.cartItem.update({ where: { id }, data: { quantity } });
    res.json({ message: 'Cart updated.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.cartItem.delete({ where: { id } });
    res.json({ message: 'Item removed from cart.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    res.json({ message: 'Cart cleared.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
