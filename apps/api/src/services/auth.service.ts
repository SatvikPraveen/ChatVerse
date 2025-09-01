// apps/api/src/services/auth.service.ts
import jwt from 'jsonwebtoken';
import { User, UserDocument } from '../models/User.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { ERROR_CODES } from '../config/constants.js';
import type { LoginRequest, RegisterRequest } from '@chatverse/types';

export class AuthService {
  async register(data: RegisterRequest): Promise<{ user: UserDocument; token: string }> {
    try {
      const { name, email, password } = data;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        AppMetrics.recordAuthEvent('failed_login');
        throw new Error(ERROR_CODES.USER_EXISTS);
      }

      // Create new user
      const user = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        presence: {
          status: 'offline',
          lastSeen: new Date()
        }
      });

      await user.save();

      // Generate JWT token
      const token = this.generateToken(user._id.toString(), user.email);

      // Set user online
      await this.setUserOnline(user._id.toString());

      AppMetrics.recordAuthEvent('register');
      logger.info({ userId: user._id, email: user.email }, 'User registered successfully');

      return { user, token };
    } catch (error) {
      logger.error({ error, email: data.email }, 'Registration failed');
      AppMetrics.recordError('auth', 'register');
      throw error;
    }
  }

  async login(data: LoginRequest): Promise<{ user: UserDocument; token: string }> {
    try {
      const { email, password } = data;

      // Find user with password field
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
        isActive: true
      }).select('+password');

      if (!user) {
        AppMetrics.recordAuthEvent('failed_login');
        throw new Error(ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        AppMetrics.recordAuthEvent('failed_login');
        throw new Error(ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Update user presence
      user.presence.status = 'online';
      user.presence.lastSeen = new Date();
      await user.save();

      // Generate JWT token
      const token = this.generateToken(user._id.toString(), user.email);

      // Set user online in Redis
      await this.setUserOnline(user._id.toString());

      AppMetrics.recordAuthEvent('login');
      logger.info({ userId: user._id, email: user.email }, 'User logged in successfully');

      return { user, token };
    } catch (error) {
      logger.error({ error, email: data.email }, 'Login failed');
      AppMetrics.recordError('auth', 'login');
      throw error;
    }
  }

  async logout(userId: string): Promise<void> {
    try {
      // Update user presence to offline
      await User.findByIdAndUpdate(userId, {
        'presence.status': 'offline',
        'presence.lastSeen': new Date()
      });

      // Remove from Redis presence
      await redisHelpers.setUserPresence(userId, 'offline');

      // Invalidate any active sessions (if using session store)
      await this.invalidateUserSessions(userId);

      AppMetrics.recordAuthEvent('logout');
      logger.info({ userId }, 'User logged out successfully');
    } catch (error) {
      logger.error({ error, userId }, 'Logout failed');
      AppMetrics.recordError('auth', 'logout');
      throw error;
    }
  }

  async refreshToken(userId: string): Promise<{ user: UserDocument; token: string }> {
    try {
      const user = await User.findOne({
        _id: userId,
        isActive: true
      });

      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Generate new token
      const token = this.generateToken(user._id.toString(), user.email);

      // Update last seen
      user.presence.lastSeen = new Date();
      await user.save();

      logger.info({ userId }, 'Token refreshed successfully');

      return { user, token };
    } catch (error) {
      logger.error({ error, userId }, 'Token refresh failed');
      AppMetrics.recordError('auth', 'refresh_token');
      throw error;
    }
  }

  async validateToken(token: string): Promise<{ userId: string; email: string }> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
        iat: number;
        exp: number;
      };

      // Check if user still exists and is active
      const user = await User.findOne({
        _id: decoded.userId,
        isActive: true
      });

      if (!user) {
        throw new Error(ERROR_CODES.INVALID_TOKEN);
      }

      return {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(ERROR_CODES.INVALID_TOKEN);
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error(ERROR_CODES.TOKEN_EXPIRED);
      }
      throw error;
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Verify old password
      const isValidPassword = await user.comparePassword(oldPassword);
      if (!isValidPassword) {
        throw new Error(ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Invalidate all existing sessions
      await this.invalidateUserSessions(userId);

      logger.info({ userId }, 'Password changed successfully');
    } catch (error) {
      logger.error({ error, userId }, 'Password change failed');
      AppMetrics.recordError('auth', 'change_password');
      throw error;
    }
  }

  async resetPasswordRequest(email: string): Promise<string> {
    try {
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
        isActive: true
      });

      if (!user) {
        // Don't reveal if user exists
        return 'reset_token_sent';
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { userId: user._id.toString(), type: 'password_reset' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Store reset token in Redis with 1 hour expiry
      await redisHelpers.setCache(`password_reset:${user._id}`, resetToken, 3600);

      logger.info({ userId: user._id, email }, 'Password reset requested');

      return resetToken;
    } catch (error) {
      logger.error({ error, email }, 'Password reset request failed');
      AppMetrics.recordError('auth', 'password_reset_request');
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Verify reset token
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        type: string;
      };

      if (decoded.type !== 'password_reset') {
        throw new Error(ERROR_CODES.INVALID_TOKEN);
      }

      // Check if token exists in Redis
      const storedToken = await redisHelpers.getCache(`password_reset:${decoded.userId}`);
      if (!storedToken || storedToken !== token) {
        throw new Error(ERROR_CODES.INVALID_TOKEN);
      }

      // Update user password
      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      user.password = newPassword;
      await user.save();

      // Remove reset token from Redis
      await redisHelpers.deleteCache(`password_reset:${decoded.userId}`);

      // Invalidate all existing sessions
      await this.invalidateUserSessions(decoded.userId);

      logger.info({ userId: decoded.userId }, 'Password reset successfully');
    } catch (error) {
      logger.error({ error }, 'Password reset failed');
      AppMetrics.recordError('auth', 'password_reset');
      throw error;
    }
  }

  private generateToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN,
        issuer: 'chatverse-api',
        audience: 'chatverse-client'
      }
    );
  }

  private async setUserOnline(userId: string): Promise<void> {
    await redisHelpers.setUserPresence(userId, 'online');
  }

  private async invalidateUserSessions(userId: string): Promise<void> {
    // Remove all user sessions from Redis
    const sessionKeys = await redisHelpers.redis.keys(`session:*:${userId}`);
    if (sessionKeys.length > 0) {
      await redisHelpers.redis.del(sessionKeys);
    }

    logger.debug({ userId, sessionCount: sessionKeys.length }, 'User sessions invalidated');
  }

  async getUserSessions(userId: string): Promise<any[]> {
    try {
      const sessionKeys = await redisHelpers.redis.keys(`session:*:${userId}`);
      const sessions = [];

      for (const key of sessionKeys) {
        const session = await redisHelpers.getSession(key.replace('session:', ''));
        if (session) {
          sessions.push({
            id: key.replace('session:', ''),
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            userAgent: session.userAgent,
            ip: session.ip
          });
        }
      }

      return sessions;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user sessions');
      return [];
    }
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    try {
      await redisHelpers.deleteSession(`${sessionId}:${userId}`);
      logger.info({ userId, sessionId }, 'Session revoked');
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Failed to revoke session');
      throw error;
    }
  }
}
