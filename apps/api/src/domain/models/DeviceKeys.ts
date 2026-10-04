import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type { OneTimePreKey, SignedPreKey } from '@chatverse/protocol';

/**
 * Public E2EE key material for one device. The server only ever sees public keys; it acts as
 * a pre-key distribution point so that peers can start sessions while the device is offline.
 */
export interface DeviceKeysDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceId: string;
  identityKey: string;
  signingKey: string;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceKeysDocument = HydratedDocument<DeviceKeysDoc>;

const deviceKeysSchema = new Schema<DeviceKeysDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    identityKey: { type: String, required: true },
    signingKey: { type: String, required: true },
    signedPreKey: {
      type: new Schema<SignedPreKey>({ id: Number, publicKey: String, signature: String }, { _id: false }),
      required: true,
    },
    oneTimePreKeys: { type: [new Schema<OneTimePreKey>({ id: Number, publicKey: String }, { _id: false })], default: [] },
    lastActiveAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

deviceKeysSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceKeysSchema.index({ userId: 1, lastActiveAt: -1 });

export const DeviceKeysModel = model<DeviceKeysDoc>('DeviceKeys', deviceKeysSchema);
