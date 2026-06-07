const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAddresses = async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.createAddress = async (req, res) => {
  try {
    const { label, street, city, state, zip, country } = req.body;
    if (!street || !city || !country) {
      return res.status(400).json({ message: 'Street, city, and country are required.' });
    }

    const count = await prisma.address.count({ where: { userId: req.user.id } });
    const isDefault = count === 0;

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: { userId: req.user.id, label, street, city, state, zip, country, isDefault },
    });
    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, street, city, state, zip, country } = req.body;

    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Address not found.' });
    }

    const address = await prisma.address.update({
      where: { id },
      data: { label, street, city, state, zip, country },
    });
    res.json(address);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Address not found.' });
    }

    await prisma.address.delete({ where: { id } });

    const remaining = await prisma.address.count({ where: { userId: req.user.id } });
    if (remaining > 0) {
      const anyDefault = await prisma.address.findFirst({
        where: { userId: req.user.id, isDefault: true },
      });
      if (!anyDefault) {
        const first = await prisma.address.findFirst({
          where: { userId: req.user.id },
          orderBy: { createdAt: 'asc' },
        });
        if (first) {
          await prisma.address.update({
            where: { id: first.id },
            data: { isDefault: true },
          });
        }
      }
    }

    res.json({ message: 'Address deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Address not found.' });
    }

    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });

    const address = await prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });
    res.json(address);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
