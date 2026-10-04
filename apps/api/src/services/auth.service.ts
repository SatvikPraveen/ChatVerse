import { ErrorCode, type AuthResponse, type LoginInput, type RegisterInput } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import { User, toUserProfile, type UserDoc } from '../domain/models/index.js';
import { AppError, isDuplicateKeyError } from '../lib/errors.js';
import { randomToken } from '../lib/ids.js';
import { hashPassword, verifyPassword } from './password.js';
import { createTokenService, type TokenService } from './tokens.js';

export function createAuthService(deps: Pick<Deps, 'env' | 'redis'>, tokens: TokenService = createTokenService(deps)) {
  const { env } = deps;

  async function session(user: UserDoc, deviceId: string): Promise<AuthResponse> {
    const { sid, refreshToken } = await tokens.openSession(user._id.toString(), deviceId);
    return {
      user: toUserProfile(user),
      accessToken: tokens.signAccess({ sub: user._id.toString(), sid, did: deviceId }),
      expiresIn: env.ACCESS_TOKEN_TTL_SEC,
      refreshToken,
    };
  }

  return {
    tokens,

    async register(input: RegisterInput, deviceId = randomToken(12)): Promise<AuthResponse> {
      const passwordHash = await hashPassword(input.password);
      try {
        const user = await User.create({ username: input.username, email: input.email, passwordHash, displayName: input.displayName });
        return session(user, deviceId);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          const field = Object.keys(err.keyPattern ?? {})[0];
          throw new AppError(field === 'email' ? ErrorCode.EMAIL_TAKEN : ErrorCode.USERNAME_TAKEN, `${field ?? 'username'} is already taken`);
        }
        throw err;
      }
    },

    async login(input: LoginInput): Promise<AuthResponse> {
      const user = await User.findOne({ email: input.email, deletedAt: null }).select('+passwordHash');
      // Always run the hash check to keep timing uniform for unknown emails.
      const ok = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, DUMMY_HASH).then(() => false);
      if (!user || !ok) throw new AppError(ErrorCode.INVALID_CREDENTIALS);
      return session(user, input.deviceId ?? randomToken(12));
    },

    async refresh(presented: string): Promise<AuthResponse> {
      const rotated = await tokens.rotate(presented);
      const user = await User.findOne({ _id: rotated.userId, deletedAt: null });
      if (!user) throw new AppError(ErrorCode.TOKEN_INVALID, 'User no longer exists');
      return {
        user: toUserProfile(user),
        accessToken: tokens.signAccess({ sub: rotated.userId, sid: rotated.sid, did: rotated.deviceId }),
        expiresIn: env.ACCESS_TOKEN_TTL_SEC,
        refreshToken: rotated.refreshToken,
      };
    },

    async logout(presented: string): Promise<void> {
      await tokens.revoke(presented);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
