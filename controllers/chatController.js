const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getConversations = async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } });

    const conversations = await prisma.conversation.findMany({
      where: merchant
        ? { merchantId: merchant.id }
        : { buyerId: req.user.id },
      include: {
        buyer: { select: { id: true, name: true } },
        merchant: { select: { id: true, storeName: true, logo: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: req.user.id }, isRead: false },
      data: { isRead: true },
    });

    res.json({
      messages: messages.reverse(),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const { merchantId, productId } = req.body;

    const existing = await prisma.conversation.findFirst({
      where: { buyerId: req.user.id, merchantId },
    });

    if (existing) {
      return res.json(existing);
    }

    const conversation = await prisma.conversation.create({
      data: {
        buyerId: req.user.id,
        merchantId,
        productId,
      },
    });

    res.status(201).json(conversation);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, imageUrl } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: req.user.id,
        content,
        imageUrl,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
