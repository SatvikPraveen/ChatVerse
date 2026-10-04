import webPush from 'web-push';
import type { Message, PushSubscriptionInput } from '@chatverse/protocol';
import { isPushConfigured } from '../config/env.js';
import type { Deps } from '../deps.js';
import {
  PushSubscriptionModel,
  User,
  participantIds,
  type ConversationDoc,
} from '../domain/models/index.js';
import { toObjectId } from '../lib/ids.js';
import type { PresenceService } from './presence.service.js';

/** Best-effort Web Push for participants who have no connected device. Never throws into the send path. */
export function createPushService(deps: Pick<Deps, 'env' | 'logger'>, presence: PresenceService) {
  const { env, logger } = deps;
  const enabled = isPushConfigured(env);
  if (enabled)
    webPush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

  return {
    enabled,
    publicKey: env.VAPID_PUBLIC_KEY ?? null,

    async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
      await PushSubscriptionModel.findOneAndUpdate(
        { userId: toObjectId(userId), endpoint: input.endpoint },
        { $set: { keys: input.keys, userAgent: input.userAgent ?? null } },
        { upsert: true },
      );
    },

    async unsubscribe(userId: string, endpoint: string): Promise<void> {
      await PushSubscriptionModel.deleteOne({ userId: toObjectId(userId), endpoint });
    },

    async notifyNewMessage(conversation: ConversationDoc, message: Message): Promise<void> {
      if (!enabled) return;
      const recipients = participantIds(conversation).filter((id) => id !== message.senderId);
      const offline: string[] = [];
      for (const id of recipients) {
        const muted = conversation.participants.find((p) => p.userId.toString() === id)?.muted;
        if (muted) continue;
        if ((await presence.get(id)).deviceCount === 0) offline.push(id);
      }
      if (offline.length === 0) return;
      const optedIn = await User.find({
        _id: { $in: offline.map(toObjectId) },
        'settings.notifications.push': true,
      }).select('_id');
      const subs = await PushSubscriptionModel.find({ userId: { $in: optedIn.map((u) => u._id) } });
      const payload = JSON.stringify({
        title: conversation.name ?? 'New message',
        body: message.kind === 'encrypted' ? 'Encrypted message' : (message.text ?? 'Attachment'),
        data: { conversationId: message.conversationId, seq: message.seq },
      });
      await Promise.allSettled(
        subs.map(async (s) => {
          try {
            await webPush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, {
              TTL: 3600,
            });
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410)
              await PushSubscriptionModel.deleteOne({ _id: s._id });
            else logger.debug({ err }, 'web-push send failed');
          }
        }),
      );
    },
  };
}

export type PushService = ReturnType<typeof createPushService>;
