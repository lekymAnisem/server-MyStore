const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getWishlist, toggleWishlist, removeFromWishlist } = require('../controllers/wishlistController');

router.get('/', authenticate, getWishlist);
router.post('/', authenticate, toggleWishlist);
router.delete('/:id', authenticate, removeFromWishlist);

module.exports = router;
