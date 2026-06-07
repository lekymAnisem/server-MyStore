const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  register, login, verifyEmail, forgotPassword, resetPassword,
  refreshToken, getMe, updateProfile, clerkSync, registerMerchant,
} = require('../controllers/authController');

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().trim(),
  body('role').optional().isIn(['BUYER', 'MERCHANT']).withMessage('Invalid role'),
  body('storeName').optional().trim(),
  body('description').optional().trim(),
  body('businessName').optional().trim(),
  validate,
], register);

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('role').optional().isIn(['BUYER', 'MERCHANT', 'ADMIN']).withMessage('Invalid role'),
  validate,
], login);

router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required'),
  validate,
], forgotPassword);
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate,
], resetPassword);
router.post('/refresh-token', refreshToken);
router.post('/clerk-sync', clerkSync);

router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);

router.post('/register-merchant', authenticate, upload.single('businessDocs'), registerMerchant);

module.exports = router;
