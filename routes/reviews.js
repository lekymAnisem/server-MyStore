const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  createReview, getProductReviews, replyToReview, deleteReview,
} = require('../controllers/reviewController');

router.get('/product/:productId', getProductReviews);
router.post('/', authenticate, upload.array('images', 5), createReview);
router.post('/:id/reply', authenticate, authorize('MERCHANT'), replyToReview);
router.delete('/:id', authenticate, authorize('ADMIN', 'BUYER'), deleteReview);

module.exports = router;
