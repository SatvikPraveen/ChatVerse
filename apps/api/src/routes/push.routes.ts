// apps/api/src/routes/push.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { PushController } from '../controllers/push.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = Router();
const pushController = new PushController();

// All routes require authentication
router.use(authenticateToken);

// Validation rules
const subscribeValidation = [
  body('subscription.endpoint')
    .isURL()
    .withMessage('Subscription endpoint must be a valid URL'),
  body('subscription.keys.p256dh')
    .isString()
    .isLength({ min: 1 })
    .withMessage('p256dh key is required'),
  body('subscription.keys.auth')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Auth key is required'),
];

const unsubscribeValidation = [
  body('endpoint')
    .isURL()
    .withMessage('Endpoint must be a valid URL'),
];

const testNotificationValidation = [
  body('title')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('body')
    .isString()
    .isLength({ min: 1, max: 300 })
    .withMessage('Body must be between 1 and 300 characters'),
];

// Routes

// Subscribe to push notifications
router.post('/subscribe', subscribeValidation, validateRequest, pushController.subscribe);

// Unsubscribe from push notifications
router.post('/unsubscribe', unsubscribeValidation, validateRequest, pushController.unsubscribe);

// Get user's push subscriptions
router.get('/subscriptions', pushController.getSubscriptions);

// Test push notification (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/test', testNotificationValidation, validateRequest, pushController.testNotification);
}

export default router;
