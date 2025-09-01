// apps/api/src/tests/unit/auth.service.test.ts
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AuthService } from '../../services/auth.service.js';
import { User } from '../../models/User.js';
import jwt from 'jsonwebtoken';
import '../setup.js';

// Mock external dependencies
jest.mock('../../db/redis.js', () => ({
  redisHelpers: {
    setUserPresence: jest.fn(),
    setCache: jest.fn(),
    getCache: jest.fn(),
    deleteCache: jest.fn(),
    invalidateUserSessions: jest.fn()
  }
}));

jest.mock('../../telemetry/metrics.js', () => ({
  AppMetrics: {
    recordAuthEvent: jest.fn(),
    recordError: jest.fn()
  }
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      const result = await authService.register(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.name).toBe(userData.name);
      expect(result.user.email).toBe(userData.email);
      expect(typeof result.token).toBe('string');
    });

    test('should throw error if user already exists', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      // Create user first
      await authService.register(userData);

      // Try to register again with same email
      await expect(authService.register(userData))
        .rejects.toThrow();
    });

    test('should hash password before saving', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      await authService.register(userData);

      const user = await User.findOne({ email: userData.email }).select('+password');
      expect(user?.password).not.toBe(userData.password);
      expect(user?.password).toMatch(/^\$2[ayb]\$\d+\$/); // bcrypt hash pattern
    });
  });

  describe('login', () => {
    test('should login user with correct credentials', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      // Register user first
      await authService.register(userData);

      // Login
      const result = await authService.login({
        email: userData.email,
        password: userData.password
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.email).toBe(userData.email);
    });

    test('should throw error with incorrect password', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      await authService.register(userData);

      await expect(authService.login({
        email: userData.email,
        password: 'wrongpassword'
      })).rejects.toThrow();
    });

    test('should throw error for non-existent user', async () => {
      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: 'password123'
      })).rejects.toThrow();
    });
  });

  describe('validateToken', () => {
    test('should validate valid JWT token', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      const { user, token } = await authService.register(userData);
      const result = await authService.validateToken(token);

      expect(result.userId).toBe(user._id.toString());
      expect(result.email).toBe(userData.email);
    });

    test('should throw error for invalid token', async () => {
      await expect(authService.validateToken('invalid-token'))
        .rejects.toThrow();
    });

    test('should throw error for expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-id', email: 'test@example.com' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      await expect(authService.validateToken(expiredToken))
        .rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    test('should change password successfully', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'oldpassword'
      };

      const { user } = await authService.register(userData);

      await authService.changePassword(
        user._id.toString(),
        'oldpassword',
        'newpassword123'
      );

      // Verify old password no longer works
      await expect(authService.login({
        email: userData.email,
        password: 'oldpassword'
      })).rejects.toThrow();

      // Verify new password works
      const loginResult = await authService.login({
        email: userData.email,
        password: 'newpassword123'
      });

      expect(loginResult.user.email).toBe(userData.email);
    });

    test('should throw error with incorrect old password', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };

      const { user } = await authService.register(userData);

      await expect(authService.changePassword(
        user._id.toString(),
        'wrongoldpassword',
        'newpassword123'
      )).rejects.toThrow();
    });
  });
});
