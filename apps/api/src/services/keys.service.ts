import { ErrorCode, LIMITS, type OneTimePreKey, type PreKeyBundle, type PreKeyBundleUploadInput, type PreKeyCountResponse } from '@chatverse/protocol';
import { DeviceKeysModel, User } from '../domain/models/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { toObjectId } from '../lib/ids.js';

/**
 * Pre-key distribution for X3DH. The server is an untrusted relay: it stores only public keys and
 * guarantees that each one-time pre-key is handed out at most once.
 */
export function createKeysService() {
  return {
    async uploadBundle(userId: string, input: PreKeyBundleUploadInput): Promise<void> {
      await DeviceKeysModel.findOneAndUpdate(
        { userId: toObjectId(userId), deviceId: input.deviceId },
        {
          $set: {
            identityKey: input.identityKey,
            signingKey: input.signingKey,
            signedPreKey: input.signedPreKey,
            oneTimePreKeys: input.oneTimePreKeys,
            lastActiveAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );
    },

    async addOneTimePreKeys(userId: string, deviceId: string, keys: OneTimePreKey[]): Promise<PreKeyCountResponse> {
      const doc = await DeviceKeysModel.findOneAndUpdate(
        { userId: toObjectId(userId), deviceId },
        { $push: { oneTimePreKeys: { $each: keys, $slice: -LIMITS.ONE_TIME_PREKEYS_MAX } }, $set: { lastActiveAt: new Date() } },
        { new: true },
      );
      if (!doc) throw notFound('Device');
      return { deviceId, oneTimePreKeys: doc.oneTimePreKeys.length };
    },

    async count(userId: string, deviceId: string): Promise<PreKeyCountResponse> {
      const doc = await DeviceKeysModel.findOne({ userId: toObjectId(userId), deviceId }).select('oneTimePreKeys');
      if (!doc) throw notFound('Device');
      return { deviceId, oneTimePreKeys: doc.oneTimePreKeys.length };
    },

    async touch(userId: string, deviceId: string): Promise<void> {
      await DeviceKeysModel.updateOne({ userId: toObjectId(userId), deviceId }, { $set: { lastActiveAt: new Date() } });
    },

    /**
     * Fetch a bundle for a user's device (most recently active by default), atomically popping one
     * one-time pre-key with `$pop` so that two concurrent fetchers never receive the same key.
     */
    async fetchBundle(targetUserId: string, deviceId?: string): Promise<PreKeyBundle> {
      const user = await User.exists({ _id: toObjectId(targetUserId), deletedAt: null });
      if (!user) throw notFound('User');
      const filter: Record<string, unknown> = { userId: toObjectId(targetUserId) };
      if (deviceId) filter.deviceId = deviceId;
      // findOneAndUpdate returns the pre-update document, i.e. including the key we just popped.
      const before = await DeviceKeysModel.findOneAndUpdate(filter, { $pop: { oneTimePreKeys: -1 } }, { sort: { lastActiveAt: -1 }, new: false });
      if (!before) throw new AppError(ErrorCode.NOT_FOUND, 'No encryption keys published for this user');
      const popped = before.oneTimePreKeys[0] ?? null;
      return {
        userId: targetUserId,
        deviceId: before.deviceId,
        identityKey: before.identityKey,
        signingKey: before.signingKey,
        signedPreKey: { id: before.signedPreKey.id, publicKey: before.signedPreKey.publicKey, signature: before.signedPreKey.signature },
        oneTimePreKey: popped ? { id: popped.id, publicKey: popped.publicKey } : null,
      };
    },
  };
}

export type KeysService = ReturnType<typeof createKeysService>;
