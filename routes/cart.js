const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  getCart, addToCart, updateCartItem, removeCartItem, clearCart,
} = require('../controllers/cartController');

router.get('/', authenticate, getCart);
router.post('/', authenticate, addToCart);
router.put('/:id', authenticate, updateCartItem);
router.delete('/:id', authenticate, removeCartItem);
router.delete('/', authenticate, clearCart);

module.exports = router;
