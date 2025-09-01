// apps/api/src/routes/conversations.routes.ts
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { ConversationsController } from '../controllers/conversations.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = Router();
const conversationsController = new ConversationsController();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const createConversationValidation = [
  body('type')
    .isIn(['direct', 'group'])
    .withMessage('Type must be either "direct" or "group"'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('participants')
    .isArray({ min: 1 })
    .withMessage('Participants must be a non-empty array'),
  body('participants.*')
    .isMongoId()
    .withMessage('Each participant must be a valid user ID'),
];

const updateConversationValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
];

const addParticipantValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('role')
    .optional()
    .isIn(['admin', 'member'])
    .withMessage('Role must be either "admin" or "member"'),
];

const conversationIdValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
];

const participantIdValidation = [
  param('conversationId')
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  param('participantId')
    .isMongoId()
    .withMessage('Invalid participant ID'),
];

// Routes
router.get('/', conversationsController.getConversations);
router.post('/', createConversationValidation, validateRequest, conversationsController.createConversation);

router.get('/:conversationId', conversationIdValidation, validateRequest, conversationsController.getConversation);
router.put('/:conversationId', updateConversationValidation, validateRequest, conversationsController.updateConversation);
router.delete('/:conversationId', conversationIdValidation, validateRequest, conversationsController.deleteConversation);

router.post('/:conversationId/participants', addParticipantValidation, validateRequest, conversationsController.addParticipant);
router.delete('/:conversationId/participants/:participantId', participantIdValidation, validateRequest, conversationsController.removeParticipant);

export default router;
