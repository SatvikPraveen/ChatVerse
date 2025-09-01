// apps/api/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import type { LoginRequest, RegisterRequest, AuthResponse } from '@chatverse/types';

export class AuthController {
  async register(req: Request<{}, AuthResponse, RegisterRequest>, res: Response<AuthResponse>) {
    try {
      const { name, email, password } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists',
          }
        } as any);
      }

      // Create new user
      const user = new User({ name, email, password });
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      // Set user presence
      await redisHelpers.setUserPresence(user._id.toString(), 'online');

      logger.info({ userId: user._id }, 'User registered successfully');

      res.status(201).json({
        success: true,
        data: {
          user: user.toPublicJSON(),
          token
        }
      } as any);
    } catch (error) {
      logger.error({ error }, 'Registration failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Registration failed',
        }
      } as any);
    }
  }

  async login(req: Request<{}, AuthResponse, LoginRequest>, res: Response<AuthResponse>) {
    try {
      const { email, password } = req.body;

      // Find user and include password for comparison
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          }
        } as any);
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Account has been disabled',
          }
        } as any);
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          }
        } as any);
      }

      // Update last seen and set online
      user.presence.lastSeen = new Date();
      user.presence.status = 'online';
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      // Set user presence in Redis
      await redisHelpers.setUserPresence(user._id.toString(), 'online');

      logger.info({ userId: user._id }, 'User logged in successfully');

      res.json({
        success: true,
        data: {
          user: user.toPublicJSON(),
          token
        }
      } as any);
    } catch (error) {
      logger.error({ error }, 'Login failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'Login failed',
        }
      } as any);
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (userId) {
        // Update user presence to offline
        await User.findByIdAndUpdate(userId, {
          'presence.status': 'offline',
          'presence.lastSeen': new Date()
        });

        // Remove from Redis presence
        await redisHelpers.setUserPresence(userId, 'offline');

        logger.info({ userId }, 'User logged out successfully');
      }

      res.json({
        success: true,
        data: { message: 'Logged out successfully' }
      });
    } catch (error) {
      logger.error({ error }, 'Logout failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Logout failed',
        }
      });
    }
  }

  async getMe(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          }
        });
      }

      res.json({
        success: true,
        data: user.toPublicJSON()
      });
    } catch (error) {
      logger.error({ error }, 'Get user profile failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROFILE_FAILED',
          message: 'Failed to get user profile',
        }
      });
    }
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const user = await User.findById(userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          }
        });
      }

      // Generate new token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        data: {
          user: user.toPublicJSON(),
          token
        }
      });
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'TOKEN_REFRESH_FAILED',
          message: 'Token refresh failed',
        }
      });
    }
  }
}
