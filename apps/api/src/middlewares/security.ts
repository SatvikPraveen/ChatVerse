// apps/api/src/middlewares/security.ts
import { Request, Response, NextFunction } from 'express';
import { body, header, ValidationChain } from 'express-validator';
import { logger } from '../utils/logger.js';

// CSRF protection for state-changing operations
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = req.headers['x-csrf-token'] || req.body._token;
    const sessionToken = req.headers['x-session-token'];

    // In production, implement proper CSRF token validation
    // For now, we'll just check that tokens are present
    if (!token && req.headers['content-type']?.includes('application/json')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_TOKEN_MISSING',
          message: 'CSRF token required',
        }
      });
    }
  }

  next();
};

// Input sanitization
export const sanitizeInput = [
  body('*').trim().escape(),
] as ValidationChain[];

// Request size limiting middleware
export const requestSizeLimit = (maxSize: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > maxSize) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request size exceeds ${maxSize} bytes`,
        }
      });
    }

    next();
  };
};

// IP-based request limiting
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';

    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      logger.warn({ ip: clientIP }, 'Request from unauthorized IP');
      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Access denied',
        }
      });
    }

    next();
  };
};

// User-Agent validation
export const validateUserAgent = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.headers['user-agent'];

  if (!userAgent) {
    logger.warn({ ip: req.ip }, 'Request without User-Agent header');
    return res.status(400).json({
      success: false,
      error: {
        code: 'USER_AGENT_REQUIRED',
        message: 'User-Agent header required',
      }
    });
  }

  // Block known malicious user agents
  const blockedPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
  ];

  const isBlocked = blockedPatterns.some(pattern => pattern.test(userAgent));
  if (isBlocked) {
    logger.warn({ userAgent, ip: req.ip }, 'Blocked user agent detected');
    return res.status(403).json({
      success: false,
      error: {
        code: 'USER_AGENT_BLOCKED',
        message: 'Access denied',
      }
    });
  }

  next();
};

// Request ID middleware for tracing
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.headers['x-request-id'] = requestId as string;
  res.setHeader('X-Request-ID', requestId);

  next();
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};
