const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { verifyAccessToken } = require('../utils/generateToken');

const prisma = new PrismaClient();
const onlineUsers = new Map();

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required.'));
      }

      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, role: true },
      });

      if (!user) {
        return next(new Error('User not found.'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, socket.id);
    io.emit('user:online', { userId, online: true });

    socket.join(`user:${userId}`);

    if (socket.user.role === 'MERCHANT') {
      socket.join(`merchant:${userId}`);
    }

    socket.on('chat:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('chat:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('chat:message', async (data) => {
      try {
        const { conversationId, content, receiverId } = data;

        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            content,
          },
          include: {
            sender: { select: { id: true, name: true } },
          },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        io.to(`conversation:${conversationId}`).emit('chat:message', message);

        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('chat:notification', {
            conversationId,
            sender: socket.user.name,
            content,
          });
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    socket.on('chat:typing', ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('chat:typing', {
        userId,
        isTyping,
      });
    });

    socket.on('order:update', (data) => {
      const { orderId, buyerId, status } = data;
      io.to(`user:${buyerId}`).emit('order:updated', { orderId, status });
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user:online', { userId, online: false });
    });
  });

  return io;
};

const getOnlineUsers = () => onlineUsers;

module.exports = { setupSocket, getOnlineUsers };
