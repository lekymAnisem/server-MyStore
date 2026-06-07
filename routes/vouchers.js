const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createVoucher, getMerchantVouchers, getActiveVouchers, updateVoucher,
} = require('../controllers/voucherController');

router.get('/', getActiveVouchers);
router.get('/merchant', authenticate, authorize('MERCHANT'), getMerchantVouchers);
router.post('/', authenticate, authorize('MERCHANT'), createVoucher);
router.put('/:id', authenticate, authorize('MERCHANT'), updateVoucher);

module.exports = router;
