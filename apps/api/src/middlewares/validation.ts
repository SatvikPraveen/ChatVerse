// apps/api/src/middlewares/validation.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array().map(error => ({
          field: error.type === 'field' ? error.path : undefined,
          message: error.msg,
          value: error.type === 'field' ? error.value : undefined,
        }))
      }
    });
  }

  next();
};
