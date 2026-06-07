const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createOrder, getOrders, getOrder, updateOrderStatus,
  getMerchantOrders, cancelOrder,
} = require('../controllers/orderController');

router.post('/', authenticate, createOrder);
router.get('/', authenticate, getOrders);
router.get('/merchant', authenticate, authorize('MERCHANT'), getMerchantOrders);
router.get('/:id', authenticate, getOrder);
router.put('/:id/status', authenticate, authorize('MERCHANT', 'ADMIN'), updateOrderStatus);
router.post('/:id/cancel', authenticate, cancelOrder);

module.exports = router;
