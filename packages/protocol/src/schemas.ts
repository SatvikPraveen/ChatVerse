import { z } from 'zod';
import { LIMITS } from './constants.js';

/**
 * Validation schemas shared by server (request validation) and clients (form validation).
 * Keeping them in one place guarantees that a client can never produce a request the server
 * rejects for shape reasons, and that limits are enforced identically on both ends.
 */

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'must be a 24-character hex identifier');

export const uuidSchema = z.string().uuid();

export const base64urlSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]*$/, 'must be base64url without padding');

export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.USERNAME_MIN)
  .max(LIMITS.USERNAME_MAX)
  .regex(/^[a-z0-9_.]+$/, 'lowercase letters, digits, "_" and "." only');

export const passwordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const displayNameSchema = z.string().trim().min(1).max(LIMITS.DISPLAY_NAME_MAX);

export const deviceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'device id must be 8-64 URL-safe characters');

// Auth --------------------------------------------------------------------

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(LIMITS.PASSWORD_MAX),
  deviceId: deviceIdSchema.optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(16).max(2048) });

// Users -------------------------------------------------------------------

export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notifications: z.object({ push: z.boolean(), sound: z.boolean() }),
  privacy: z.object({ showOnlineStatus: z.boolean(), readReceipts: z.boolean() }),
});

export const updateMeSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    settings: userSettingsSchema.deepPartial().optional(),
  })
  .strict();

export const userSearchSchema = z.object({
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const presenceStatusSchema = z.enum(['online', 'away', 'busy']);

// Conversations -----------------------------------------------------------

export const createConversationSchema = z
  .object({
    kind: z.enum(['direct', 'group']),
    participantIds: z.array(objectIdSchema).min(1).max(LIMITS.GROUP_PARTICIPANTS_MAX),
    name: z.string().trim().min(1).max(LIMITS.GROUP_NAME_MAX).optional(),
    topic: z.string().trim().max(LIMITS.GROUP_TOPIC_MAX).optional(),
    encrypted: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'direct' && value.participantIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participantIds'],
        message: 'a direct conversation has exactly one other participant',
      });
    }
    if (value.kind === 'group' && !value.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'groups need a name' });
    }
  });

export const updateConversationSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.GROUP_NAME_MAX).optional(),
    topic: z.string().trim().max(LIMITS.GROUP_TOPIC_MAX).nullable().optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
  })
  .strict();

export const addParticipantsSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(LIMITS.GROUP_PARTICIPANTS_MAX),
});

export const conversationsQuerySchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.PAGE_SIZE_MAX).default(LIMITS.PAGE_SIZE_DEFAULT),
});

// Messages ----------------------------------------------------------------

export const encryptedPayloadSchema = z.object({
  v: z.literal(1),
  suite: z.string().min(1).max(64),
  header: base64urlSchema.max(4096),
  ciphertext: base64urlSchema.max(LIMITS.MESSAGE_CIPHERTEXT_MAX),
});

const messageKindSchema = z.enum(['text', 'image', 'file', 'audio', 'video', 'encrypted']);

export const messageSendSchema = z
  .object({
    conversationId: objectIdSchema,
    clientMsgId: uuidSchema,
    kind: messageKindSchema,
    text: z.string().max(LIMITS.MESSAGE_TEXT_MAX).optional(),
    encrypted: encryptedPayloadSchema.optional(),
    attachmentIds: z.array(objectIdSchema).max(LIMITS.ATTACHMENTS_MAX).optional(),
    replyTo: objectIdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'encrypted') {
      if (!value.encrypted) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['encrypted'], message: 'required' });
      }
      if (value.text !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['text'],
          message: 'encrypted messages must not carry plaintext',
        });
      }
    } else if (value.encrypted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['encrypted'],
        message: 'only kind=encrypted may carry an encrypted payload',
      });
    } else if (value.kind === 'text' && !value.text?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'required' });
    } else if (value.kind !== 'text' && !value.attachmentIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attachmentIds'],
        message: 'media messages need at least one attachment',
      });
    }
  });

/** REST variant: conversationId comes from the URL. */
export const messageCreateBodySchema = messageSendSchema.innerType().omit({ conversationId: true });

export const messageEditSchema = z
  .object({
    messageId: objectIdSchema,
    text: z.string().trim().min(1).max(LIMITS.MESSAGE_TEXT_MAX).optional(),
    encrypted: encryptedPayloadSchema.optional(),
  })
  .refine((v) => (v.text === undefined) !== (v.encrypted === undefined), {
    message: 'provide exactly one of text or encrypted',
  });

export const messagesQuerySchema = z
  .object({
    beforeSeq: z.coerce.number().int().min(1).optional(),
    afterSeq: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.PAGE_SIZE_MAX).default(LIMITS.PAGE_SIZE_DEFAULT),
  })
  .refine((v) => !(v.beforeSeq !== undefined && v.afterSeq !== undefined), {
    message: 'beforeSeq and afterSeq are mutually exclusive',
  });

export const messageSearchSchema = z.object({
  q: z.string().trim().min(2).max(128),
  conversationId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const reactionSchema = z.object({
  messageId: objectIdSchema,
  emoji: z.string().min(1).max(LIMITS.REACTION_EMOJI_MAX),
});

export const receiptSchema = z.object({
  conversationId: objectIdSchema,
  seq: z.number().int().min(0),
});

export const typingSchema = z.object({ conversationId: objectIdSchema, isTyping: z.boolean() });

export const syncPullSchema = z.object({
  conversationId: objectIdSchema,
  afterSeq: z.number().int().min(0),
  limit: z.number().int().min(1).max(LIMITS.PAGE_SIZE_MAX).default(LIMITS.PAGE_SIZE_DEFAULT),
});

export const joinConversationSchema = z.object({ conversationId: objectIdSchema });

// Keys --------------------------------------------------------------------

const preKeySchema = z.object({ id: z.number().int().min(0), publicKey: base64urlSchema.min(32).max(128) });

export const preKeyBundleUploadSchema = z.object({
  deviceId: deviceIdSchema,
  identityKey: base64urlSchema.min(32).max(128),
  signingKey: base64urlSchema.min(32).max(128),
  signedPreKey: preKeySchema.extend({ signature: base64urlSchema.min(64).max(128) }),
  oneTimePreKeys: z.array(preKeySchema).max(LIMITS.ONE_TIME_PREKEYS_MAX),
});

export const oneTimePreKeysUploadSchema = z.object({
  deviceId: deviceIdSchema,
  oneTimePreKeys: z.array(preKeySchema).min(1).max(LIMITS.ONE_TIME_PREKEYS_MAX),
});

// Uploads -----------------------------------------------------------------

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'application/octet-stream',
] as const;

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(LIMITS.ATTACHMENT_SIZE_MAX),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});

// Push --------------------------------------------------------------------

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(256) }),
  userAgent: z.string().max(512).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type MessageSendValidated = z.infer<typeof messageSendSchema>;
export type MessageEditValidated = z.infer<typeof messageEditSchema>;
export type PreKeyBundleUploadInput = z.infer<typeof preKeyBundleUploadSchema>;
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
