const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../controllers/addressController');

router.get('/', authenticate, getAddresses);
router.post('/', authenticate, createAddress);
router.put('/:id', authenticate, updateAddress);
router.delete('/:id', authenticate, deleteAddress);
router.put('/:id/default', authenticate, setDefaultAddress);

module.exports = router;
