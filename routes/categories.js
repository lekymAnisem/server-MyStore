const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getCategories, createCategory, updateCategory } = require('../controllers/categoryController');

router.get('/', getCategories);
router.post('/', authenticate, authorize('ADMIN'), createCategory);
router.put('/:id', authenticate, authorize('ADMIN'), updateCategory);

module.exports = router;
