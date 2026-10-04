import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ErrorCode } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import { AppError } from '../lib/errors.js';
import { randomToken, uuid } from '../lib/ids.js';

export interface AccessClaims {
  sub: string;
  sid: string; // session (refresh family) id
  did: string; // device id
}

/**
 * Refresh-token rotation with reuse detection (OAuth 2.0 Security BCP §4.14).
 *
 * Every login opens a *family* (sid). Each refresh issues a new token in that family and
 * retires the previous one. If a retired token is presented again, somebody is replaying a
 * stolen token: the whole family is revoked, which logs out both the attacker and the victim
 * and forces a fresh login. Tokens are stored hashed; Redis TTL enforces expiry.
 */
export function createTokenService(deps: Pick<Deps, 'env' | 'redis'>) {
  const { env, redis } = deps;
  const r = redis.client;
  const famKey = (sid: string) => `rt:fam:${sid}`;
  const tokKey = (hash: string) => `rt:tok:${hash}`;
  const hashToken = (t: string) => createHash('sha256').update(t).digest('base64url');

  async function issueRefresh(userId: string, sid: string, deviceId: string): Promise<string> {
    const token = randomToken(48);
    const h = hashToken(token);
    const ttl = env.REFRESH_TOKEN_TTL_SEC;
    await r
      .multi()
      .hset(famKey(sid), { userId, deviceId, current: h })
      .expire(famKey(sid), ttl)
      .set(tokKey(h), sid, 'EX', ttl)
      .exec();
    return token;
  }

  return {
    signAccess(claims: AccessClaims): string {
      return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL_SEC, jwtid: uuid() });
    },

    verifyAccess(token: string): AccessClaims {
      try {
        const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.did !== 'string') {
          throw new AppError(ErrorCode.TOKEN_INVALID, 'Malformed token');
        }
        return { sub: payload.sub, sid: payload.sid, did: payload.did };
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err instanceof jwt.TokenExpiredError) throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Access token expired');
        throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid access token');
      }
    },

    /** Open a new family and return its first refresh token. */
    async openSession(userId: string, deviceId: string): Promise<{ sid: string; refreshToken: string }> {
      const sid = uuid();
      const refreshToken = await issueRefresh(userId, sid, deviceId);
      return { sid, refreshToken };
    },

    /** Rotate: validates, retires the presented token and issues its successor. */
    async rotate(presented: string): Promise<{ userId: string; sid: string; deviceId: string; refreshToken: string }> {
      const h = hashToken(presented);
      const sid = await r.get(tokKey(h));
      if (!sid) throw new AppError(ErrorCode.TOKEN_INVALID, 'Refresh token is invalid or expired');
      const fam = await r.hgetall(famKey(sid));
      if (!fam.userId || !fam.current || !fam.deviceId) {
        await r.del(tokKey(h));
        throw new AppError(ErrorCode.TOKEN_INVALID, 'Session no longer exists');
      }
      if (fam.current !== h) {
        // Reuse of a retired token: revoke the entire family.
        await r.multi().del(famKey(sid)).del(tokKey(fam.current)).del(tokKey(h)).exec();
        throw new AppError(ErrorCode.TOKEN_REUSED, 'Refresh token reuse detected; session revoked');
      }
      // The retired token keeps resolving to its family (until its TTL) so that a later replay is
      // recognised as reuse rather than as an unknown token.
      const refreshToken = await issueRefresh(fam.userId, sid, fam.deviceId);
      return { userId: fam.userId, sid, deviceId: fam.deviceId, refreshToken };
    },

    async revoke(presented: string): Promise<void> {
      const h = hashToken(presented);
      const sid = await r.get(tokKey(h));
      if (!sid) return;
      await r.multi().del(famKey(sid)).del(tokKey(h)).exec();
    },

    async isSessionActive(sid: string): Promise<boolean> {
      return (await r.exists(famKey(sid))) === 1;
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
