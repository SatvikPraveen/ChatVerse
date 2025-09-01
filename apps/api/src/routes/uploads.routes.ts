// apps/api/src/routes/uploads.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { UploadsController } from '../controllers/uploads.controller.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';
import { uploadRateLimiter } from '../middlewares/rateLimit.js';

const router = Router();
const uploadsController = new UploadsController();

// All upload routes require authentication
router.use(authenticateToken);
router.use(uploadRateLimiter);

// Validation rules
const presignValidation = [
  body('fileName')
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters'),
  body('fileType')
    .isString()
    .matches(/^[a-zA-Z0-9]+\/[a-zA-Z0-9\-\+\.]+$/)
    .withMessage('Invalid file type format'),
  body('fileSize')
    .isNumeric()
    .isInt({ min: 1, max: 10 * 1024 * 1024 })
    .withMessage('File size must be between 1 byte and 10MB'),
];

// Routes
router.post('/presign', presignValidation, validateRequest, uploadsController.getPresignedUrl);
router.get('/:fileId', uploadsController.getFile);
router.delete('/:fileId', uploadsController.deleteFile);

export default router;
