const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getProducts, getProduct, createProduct, updateProduct,
  deleteProduct, getMerchantProducts, getProductsByCategory,
} = require('../controllers/productController');

router.get('/', getProducts);
router.get('/merchant', authenticate, authorize('MERCHANT'), getMerchantProducts);
router.get('/by-category', getProductsByCategory);
router.get('/:slug', optionalAuth, getProduct);

router.post('/', authenticate, authorize('MERCHANT'), upload.array('images', 10), [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('categoryId').notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock is required'),
  validate,
], createProduct);

router.put('/:id', authenticate, authorize('MERCHANT'), upload.array('images', 10), updateProduct);
router.delete('/:id', authenticate, authorize('MERCHANT', 'ADMIN'), deleteProduct);

module.exports = router;
