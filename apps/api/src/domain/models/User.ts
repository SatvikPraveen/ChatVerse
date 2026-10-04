import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type { PublicUser, UserProfile, UserSettings } from '@chatverse/protocol';
import { toIso } from '../../lib/time.js';

export interface UserDoc {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  settings: UserSettings;
  lastSeen: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserDoc>;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notifications: { push: true, sound: true },
  privacy: { showOnlineStatus: true, readReceipts: true },
};

const userSchema = new Schema<UserDoc>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, default: null },
    settings: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      notifications: {
        push: { type: Boolean, default: true },
        sound: { type: Boolean, default: true },
      },
      privacy: {
        showOnlineStatus: { type: Boolean, default: true },
        readReceipts: { type: Boolean, default: true },
      },
    },
    lastSeen: { type: Date, default: () => new Date() },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ username: 'text', displayName: 'text' });

export const User = model<UserDoc>('User', userSchema);

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: u._id.toString(),
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toUserProfile(u: UserDoc): UserProfile {
  return {
    ...toPublicUser(u),
    email: u.email,
    settings: {
      theme: u.settings.theme,
      notifications: { push: u.settings.notifications.push, sound: u.settings.notifications.sound },
      privacy: { showOnlineStatus: u.settings.privacy.showOnlineStatus, readReceipts: u.settings.privacy.readReceipts },
    },
    updatedAt: toIso(u.updatedAt) ?? u.createdAt.toISOString(),
  };
}
