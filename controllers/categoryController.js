const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, image } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ message: 'Category already exists.' });
    }

    const category = await prisma.category.create({
      data: { name, slug, description, image },
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image, isActive } = req.body;

    const data = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (image) data.image = image;
    if (isActive !== undefined) data.isActive = isActive;

    const category = await prisma.category.update({
      where: { id },
      data,
    });

    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
