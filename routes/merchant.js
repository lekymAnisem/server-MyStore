const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getDashboard, getStore, updateStore } = require('../controllers/merchantController');

router.get('/dashboard', authenticate, authorize('MERCHANT'), getDashboard);
router.put('/store', authenticate, authorize('MERCHANT'), updateStore);
router.get('/store/:slug', getStore);

module.exports = router;
