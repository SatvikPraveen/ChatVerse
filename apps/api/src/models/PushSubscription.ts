// apps/api/src/models/PushSubscription.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface PushSubscriptionDocument extends Document {
  userId: Schema.Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true
    },
    auth: {
      type: String,
      required: true
    }
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days TTL

export const PushSubscription = mongoose.model<PushSubscriptionDocument>('PushSubscription', pushSubscriptionSchema);
