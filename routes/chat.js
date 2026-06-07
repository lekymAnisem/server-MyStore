const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  getConversations, getMessages, createConversation, sendMessage,
} = require('../controllers/chatController');

router.get('/conversations', authenticate, getConversations);
router.post('/conversations', authenticate, createConversation);
router.get('/conversations/:conversationId/messages', authenticate, getMessages);
router.post('/conversations/:conversationId/messages', authenticate, sendMessage);

module.exports = router;
