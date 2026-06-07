const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/generateToken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const prisma = new PrismaClient();

const generateTokens = (user) => {
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id, user.role);
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role, storeName, description, businessName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    if (role === 'MERCHANT' && !storeName) {
      return res.status(400).json({ message: 'Store name is required for merchant registration.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    let storeSlug = null;
    if (role === 'MERCHANT') {
      storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugExists = await prisma.merchant.findUnique({ where: { storeSlug } });
      if (slugExists) {
        return res.status(400).json({ message: 'Store name already taken.' });
      }
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        verificationToken,
        role: role === 'MERCHANT' ? 'MERCHANT' : 'BUYER',
      },
      select: { id: true, name: true, email: true, role: true, phone: true },
    });

    if (role === 'MERCHANT') {
      await prisma.merchant.create({
        data: {
          userId: user.id,
          storeName,
          storeSlug,
          description,
          businessName,
          isApproved: false,
        },
      });
    }

    await prisma.cart.create({ data: { userId: user.id } });
    await prisma.wishlist.create({ data: { userId: user.id } });

    await sendVerificationEmail(email, verificationToken);

    const tokens = generateTokens(user);

    res.status(201).json({
      message: role === 'MERCHANT' ? 'Merchant registration submitted for approval.' : 'Registration successful. Please verify your email.',
      user,
      ...tokens,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (role && user.role !== role) {
      return res.status(403).json({ message: `Access denied. This account is not registered as ${role.toLowerCase()}.` });
    }

    const tokens = generateTokens(user);

    res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isVerified: user.isVerified,
      },
      ...tokens,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExp = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp },
    });

    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'Password reset email sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    res.json({ message: 'Password reset successful.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required.' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    const tokens = generateTokens(user);

    res.json(tokens);
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired refresh token.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        isVerified: true, createdAt: true,
        merchant: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone },
      select: { id: true, name: true, email: true, role: true, phone: true },
    });

    res.json({ message: 'Profile updated.', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.clerkSync = async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const pwd = 'clerk_' + require('crypto').createHash('md5').update(email).digest('hex').slice(0, 8);
    const displayName = name || email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const hashedPassword = await bcrypt.hash(pwd, 12);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, name: displayName },
        select: { id: true, name: true, email: true, role: true, phone: true },
      });
    } else {
      const hashedPassword = await bcrypt.hash(pwd, 12);
      user = await prisma.user.create({
        data: { name: displayName, email, password: hashedPassword, phone: '', role: 'BUYER' },
        select: { id: true, name: true, email: true, role: true, phone: true },
      });
      await prisma.cart.create({ data: { userId: user.id } });
    }

    const tokens = generateTokens(user);
    res.json({ message: 'Synced successfully.', user, ...tokens });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.registerMerchant = async (req, res) => {
  try {
    const { storeName, description, phone, businessName } = req.body;
    const userId = req.user.id;

    const existingMerchant = await prisma.merchant.findUnique({ where: { userId } });
    if (existingMerchant) {
      return res.status(400).json({ message: 'You are already registered as a merchant.' });
    }

    const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const slugExists = await prisma.merchant.findUnique({ where: { storeSlug } });
    if (slugExists) {
      return res.status(400).json({ message: 'Store name already taken.' });
    }

    let businessDocs = null;
    if (req.file) {
      businessDocs = req.file.path;
    }

    const merchant = await prisma.merchant.create({
      data: {
        userId,
        storeName,
        storeSlug,
        description,
        phone,
        businessName,
        businessDocs,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { role: 'MERCHANT' },
    });

    const tokens = generateTokens({ id: userId, role: 'MERCHANT' });

    res.status(201).json({
      message: 'Merchant registration submitted for approval.',
      merchant,
      ...tokens,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
