const { PrismaClient } = require('@prisma/client');
const { uploadToCloudinary } = require('../utils/cloudinary');
const prisma = new PrismaClient();

exports.getProducts = async (req, res) => {
  try {
    const {
      search, category, minPrice, maxPrice, rating, brand,
      merchantId, sort, page = 1, limit = 20,
    } = req.query;

    const where = { isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.categoryId = category;
    if (brand) where.brand = { contains: brand, mode: 'insensitive' };
    if (merchantId) where.merchantId = merchantId;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }
    if (rating) {
      where.rating = { gte: parseFloat(rating) };
    }

    let orderBy = { createdAt: 'desc' };
    switch (sort) {
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'best_selling': orderBy = { sold: 'desc' }; break;
      case 'rating': orderBy = { rating: 'desc' }; break;
      case 'newest': orderBy = { createdAt: 'desc' }; break;
      default: orderBy = { sold: 'desc' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
          category: { select: { id: true, name: true, slug: true } },
          merchant: {
            select: { id: true, storeName: true, storeSlug: true, logo: true },
          },
        },
        orderBy,
        skip,
        take: parseInt(limit),
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products: products.map((p) => ({
        ...p,
        image: p.images[0]?.imageUrl || null,
        images: undefined,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variations: true,
        category: true,
        merchant: {
          select: {
            id: true, storeName: true, storeSlug: true, logo: true,
            createdAt: true,
            _count: { select: { products: true } },
          },
        },
        reviews: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const merchantProducts = await prisma.product.count({
      where: { merchantId: product.merchantId, isActive: true },
    });

    res.json({ ...product, totalMerchantProducts: merchantProducts });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id },
    });

    if (!merchant || !merchant.isApproved) {
      return res.status(403).json({ message: 'Merchant account not approved.' });
    }

    const { name, description, categoryId, brand, price, salePrice, stock, sku, variations } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();

    const product = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        categoryId,
        name,
        slug,
        description,
        brand,
        price: parseFloat(price),
        salePrice: salePrice ? parseFloat(salePrice) : null,
        stock: parseInt(stock),
        sku,
      },
    });

    if (variations) {
      const parsedVariations = typeof variations === 'string' ? JSON.parse(variations) : variations;
      if (Array.isArray(parsedVariations)) {
        await prisma.productVariation.createMany({
          data: parsedVariations.map((v) => ({
            productId: product.id,
            type: v.type,
            value: v.value,
            price: v.price ? parseFloat(v.price) : null,
            stock: v.stock ? parseInt(v.stock) : null,
            sku: v.sku,
          })),
        });
      }
    }

    if (req.files && req.files.length > 0) {
      const imageData = await Promise.all(
        req.files.map(async (file, index) => {
          const imageUrl = await uploadToCloudinary(file.path);
          return {
            productId: product.id,
            imageUrl,
            isPrimary: index === 0,
            sortOrder: index,
          };
        })
      );
      await prisma.productImage.createMany({ data: imageData });
    }

    const createdProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: { images: true, variations: true },
    });

    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (product.merchantId !== merchant.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const { name, description, categoryId, brand, price, salePrice, stock, sku, isActive } = req.body;

    const data = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (categoryId) data.categoryId = categoryId;
    if (brand !== undefined) data.brand = brand;
    if (price) data.price = parseFloat(price);
    if (salePrice !== undefined) data.salePrice = salePrice ? parseFloat(salePrice) : null;
    if (stock !== undefined) data.stock = parseInt(stock);
    if (sku !== undefined) data.sku = sku;
    if (isActive !== undefined) data.isActive = isActive === 'true';

    const updated = await prisma.product.update({
      where: { id },
      data,
      include: { images: { orderBy: { sortOrder: 'asc' } }, variations: true },
    });

    if (req.files && req.files.length > 0) {
      const existingCount = updated.images.length;
      const imageData = await Promise.all(
        req.files.map(async (file, index) => {
          const imageUrl = await uploadToCloudinary(file.path);
          return {
            productId: product.id,
            imageUrl,
            isPrimary: existingCount === 0 && index === 0,
            sortOrder: existingCount + index,
          };
        })
      );
      await prisma.productImage.createMany({ data: imageData });
    }

    const result = await prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variations: true },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });
    if (product.merchantId !== merchant.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    await prisma.cartItem.deleteMany({ where: { productId: id } });
    await prisma.wishlistItem.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });

    res.json({ message: 'Product deleted permanently.' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ message: 'Cannot delete product with existing orders. Please contact support.' });
    }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 6,
    });

    const sections = await Promise.all(
      categories.map(async (cat) => {
        const products = await prisma.product.findMany({
          where: { categoryId: cat.id, isActive: true },
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
            merchant: { select: { id: true, storeName: true, storeSlug: true } },
          },
          orderBy: { sold: 'desc' },
          take: 8,
        });

        return {
          category: { id: cat.id, name: cat.name, slug: cat.slug, image: cat.image },
          products: products.map((p) => ({
            ...p,
            image: p.images[0]?.imageUrl || null,
            images: undefined,
          })),
        };
      })
    );

    res.json(sections.filter((s) => s.products.length > 0));
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getMerchantProducts = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id },
    });

    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found.' });
    }

    const products = await prisma.product.findMany({
      where: { merchantId: merchant.id },
      include: {
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
        category: true,
        _count: { select: { reviews: true, orderItems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(products.map((p) => ({ ...p, image: p.images[0]?.imageUrl || null })));
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
