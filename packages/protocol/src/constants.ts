/** Hard limits enforced by the server and mirrored by clients for early validation. */
export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  DISPLAY_NAME_MAX: 64,
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 256,
  MESSAGE_TEXT_MAX: 8_000,
  /** Base64 size cap of an encrypted payload (ciphertext + header). */
  MESSAGE_CIPHERTEXT_MAX: 32_000,
  ATTACHMENTS_MAX: 10,
  ATTACHMENT_SIZE_MAX: 25 * 1024 * 1024,
  GROUP_NAME_MAX: 100,
  GROUP_TOPIC_MAX: 500,
  GROUP_PARTICIPANTS_MAX: 512,
  PAGE_SIZE_DEFAULT: 50,
  PAGE_SIZE_MAX: 200,
  ONE_TIME_PREKEYS_MAX: 100,
  REACTION_EMOJI_MAX: 16,
} as const;

/** Socket.IO room naming conventions. Rooms are the unit of fan-out. */
export const ROOMS = {
  user: (userId: string) => `u:${userId}`,
  conversation: (conversationId: string) => `c:${conversationId}`,
} as const;

/** Per-event socket rate limits (token bucket: `points` events per `windowSec`). */
export const SOCKET_RATE_LIMITS = {
  'message:send': { points: 30, windowSec: 10 },
  'message:edit': { points: 20, windowSec: 10 },
  'message:delete': { points: 20, windowSec: 10 },
  'reaction:toggle': { points: 60, windowSec: 10 },
  typing: { points: 20, windowSec: 10 },
  'receipt:read': { points: 60, windowSec: 10 },
  'receipt:delivered': { points: 120, windowSec: 10 },
  'presence:set': { points: 10, windowSec: 60 },
  'sync:pull': { points: 30, windowSec: 10 },
  'conversation:join': { points: 60, windowSec: 10 },
} as const;

export type RateLimitedEvent = keyof typeof SOCKET_RATE_LIMITS;
