// apps/api/src/routes/users.routes.ts
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { UsersController } from '../controllers/users.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = Router();
const usersController = new UsersController();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const updateProfileValidation = [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('avatar')
    .optional()
    .isString()
    .isURL()
    .withMessage('Avatar must be a valid URL'),
];

const updateSettingsValidation = [
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notifications setting must be boolean'),
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notifications setting must be boolean'),
  body('notifications.sound')
    .optional()
    .isBoolean()
    .withMessage('Sound notifications setting must be boolean'),
  body('privacy.showOnlineStatus')
    .optional()
    .isBoolean()
    .withMessage('Show online status setting must be boolean'),
  body('privacy.allowMessageRequests')
    .optional()
    .isBoolean()
    .withMessage('Allow message requests setting must be boolean'),
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme must be light, dark, or system'),
];

const searchUsersValidation = [
  query('q')
    .isString()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
];

const userIdValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
];

// Routes

// Get current user profile
router.get('/profile', usersController.getProfile);

// Update user profile
router.put('/profile', updateProfileValidation, validateRequest, usersController.updateProfile);

// Update user settings
router.put('/settings', updateSettingsValidation, validateRequest, usersController.updateSettings);

// Search users
router.get('/search', searchUsersValidation, validateRequest, usersController.searchUsers);

// Get user statistics
router.get('/stats', usersController.getStats);

// Get user by ID
router.get('/:userId', userIdValidation, validateRequest, usersController.getUserById);

// Delete user account
router.delete('/profile', usersController.deleteAccount);

export default router;
