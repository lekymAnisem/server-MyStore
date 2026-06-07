const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getDashboard, getUsers, getMerchants, getOrders, getAllProducts, updateOrderStatus, approveMerchant } = require('../controllers/adminController');

router.use(authenticate, authorize('ADMIN'));

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.get('/merchants', getMerchants);
router.get('/orders', getOrders);
router.get('/products', getAllProducts);
router.put('/orders/:id/status', updateOrderStatus);
router.put('/merchants/:id/approve', approveMerchant);

module.exports = router;
