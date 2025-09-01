// apps/api/src/routes/messages.routes.ts
import { Router } from 'express';
import { body, param } from 'express-validator';
import { MessagesController } from '../controllers/messages.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';
import { messageRateLimiter } from '../middlewares/rateLimit.js';

const router = Router();
const messagesController = new MessagesController();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const messageIdValidation = [
  param('messageId')
    .isMongoId()
    .withMessage('Invalid message ID'),
];

const conversationIdValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
];

const updateMessageValidation = [
  param('messageId')
    .isMongoId()
    .withMessage('Invalid message ID'),
  body('content')
    .isString()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Content must be between 1 and 4000 characters'),
];

const addReactionValidation = [
  param('messageId')
    .isMongoId()
    .withMessage('Invalid message ID'),
  body('emoji')
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('Emoji must be between 1 and 10 characters'),
];

const removeReactionValidation = [
  param('messageId')
    .isMongoId()
    .withMessage('Invalid message ID'),
  param('emoji')
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('Emoji must be between 1 and 10 characters'),
];

const markAsReadValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  body('messageIds')
    .isArray({ min: 1 })
    .withMessage('Message IDs must be a non-empty array'),
  body('messageIds.*')
    .isMongoId()
    .withMessage('Each message ID must be valid'),
];

// Routes

// Get messages for conversation
router.get('/conversation/:conversationId', conversationIdValidation, validateRequest, messagesController.getMessages);

// Get single message
router.get('/:messageId', messageIdValidation, validateRequest, messagesController.getMessage);

// Update message
router.put('/:messageId', updateMessageValidation, validateRequest, messagesController.updateMessage);

// Delete message
router.delete('/:messageId', messageIdValidation, validateRequest, messagesController.deleteMessage);

// Add reaction to message
router.post('/:messageId/reactions', addReactionValidation, validateRequest, messagesController.addReaction);

// Remove reaction from message
router.delete('/:messageId/reactions/:emoji', removeReactionValidation, validateRequest, messagesController.removeReaction);

// Mark messages as read
router.post('/conversation/:conversationId/read', markAsReadValidation, validateRequest, messagesController.markAsRead);

export default router;
