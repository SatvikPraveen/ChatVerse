import type { PublicUser, UpdateMeInput, UserProfile } from '@chatverse/protocol';
import { User, toPublicUser, toUserProfile, type UserDoc } from '../domain/models/index.js';
import { notFound } from '../lib/errors.js';
import { toObjectId } from '../lib/ids.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createUsersService() {
  return {
    async getById(userId: string): Promise<UserDoc> {
      const user = await User.findOne({ _id: toObjectId(userId), deletedAt: null });
      if (!user) throw notFound('User');
      return user;
    },

    async me(userId: string): Promise<UserProfile> {
      return toUserProfile(await this.getById(userId));
    },

    async getPublic(userId: string): Promise<PublicUser> {
      return toPublicUser(await this.getById(userId));
    },

    async getManyPublic(userIds: string[]): Promise<PublicUser[]> {
      const users = await User.find({ _id: { $in: userIds.map(toObjectId) }, deletedAt: null });
      return users.map(toPublicUser);
    },

    async updateMe(userId: string, input: UpdateMeInput): Promise<UserProfile> {
      const $set: Record<string, unknown> = {};
      if (input.displayName !== undefined) $set.displayName = input.displayName;
      if (input.bio !== undefined) $set.bio = input.bio;
      if (input.avatarUrl !== undefined) $set.avatarUrl = input.avatarUrl;
      if (input.settings) {
        // Deep-partial settings → dotted paths so untouched leaves keep their value.
        const walk = (prefix: string, obj: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            if (v && typeof v === 'object') walk(`${prefix}.${k}`, v as Record<string, unknown>);
            else $set[`${prefix}.${k}`] = v;
          }
        };
        walk('settings', input.settings as Record<string, unknown>);
      }
      const user = await User.findOneAndUpdate({ _id: toObjectId(userId), deletedAt: null }, { $set }, { new: true });
      if (!user) throw notFound('User');
      return toUserProfile(user);
    },

    /** Prefix search on username/displayName (case-insensitive), excluding the caller. */
    async search(query: string, limit: number, excludeUserId: string): Promise<PublicUser[]> {
      const re = new RegExp(`^${escapeRegex(query)}`, 'i');
      const users = await User.find({
        deletedAt: null,
        _id: { $ne: toObjectId(excludeUserId) },
        $or: [{ username: re }, { displayName: re }],
      })
        .sort({ username: 1 })
        .limit(limit);
      return users.map(toPublicUser);
    },

    async touchLastSeen(userId: string): Promise<void> {
      await User.updateOne({ _id: toObjectId(userId) }, { $set: { lastSeen: new Date() } });
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
