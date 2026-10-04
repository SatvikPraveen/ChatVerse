import { describe, expect, it } from 'vitest';
import {
  createConversationSchema,
  messageSendSchema,
  messagesQuerySchema,
  registerSchema,
} from './schemas.js';

const oid = 'a'.repeat(24);
const uuid = '3f6c7f6a-8b2e-4c9f-9c0a-2d5b0f1e4a7b';

describe('registerSchema', () => {
  it('normalises email and enforces username charset', () => {
    const parsed = registerSchema.parse({
      username: 'alice_01',
      email: '  Alice@Example.COM ',
      password: 'correct horse battery',
      displayName: 'Alice',
    });
    expect(parsed.email).toBe('alice@example.com');
    expect(() =>
      registerSchema.parse({ username: 'Al ice', email: 'a@b.co', password: 'x'.repeat(12), displayName: 'A' }),
    ).toThrow();
  });
});

describe('messageSendSchema', () => {
  it('accepts a plaintext message', () => {
    expect(
      messageSendSchema.safeParse({ conversationId: oid, clientMsgId: uuid, kind: 'text', text: 'hi' }).success,
    ).toBe(true);
  });

  it('rejects empty text', () => {
    expect(
      messageSendSchema.safeParse({ conversationId: oid, clientMsgId: uuid, kind: 'text', text: '   ' }).success,
    ).toBe(false);
  });

  it('requires an encrypted payload for kind=encrypted and forbids plaintext alongside it', () => {
    const base = { conversationId: oid, clientMsgId: uuid, kind: 'encrypted' as const };
    expect(messageSendSchema.safeParse(base).success).toBe(false);
    const payload = { v: 1, suite: 'x3dh-dr-v1', header: 'abc', ciphertext: 'def' };
    expect(messageSendSchema.safeParse({ ...base, encrypted: payload }).success).toBe(true);
    expect(messageSendSchema.safeParse({ ...base, encrypted: payload, text: 'leak' }).success).toBe(false);
  });

  it('rejects an encrypted payload on a plaintext kind', () => {
    const payload = { v: 1, suite: 'x3dh-dr-v1', header: 'abc', ciphertext: 'def' };
    expect(
      messageSendSchema.safeParse({ conversationId: oid, clientMsgId: uuid, kind: 'text', text: 'a', encrypted: payload })
        .success,
    ).toBe(false);
  });
});

describe('createConversationSchema', () => {
  it('requires exactly one peer for direct conversations and a name for groups', () => {
    expect(createConversationSchema.safeParse({ kind: 'direct', participantIds: [oid] }).success).toBe(true);
    expect(createConversationSchema.safeParse({ kind: 'direct', participantIds: [oid, oid] }).success).toBe(false);
    expect(createConversationSchema.safeParse({ kind: 'group', participantIds: [oid] }).success).toBe(false);
    expect(createConversationSchema.safeParse({ kind: 'group', participantIds: [oid], name: 'Team' }).success).toBe(
      true,
    );
  });
});

describe('messagesQuerySchema', () => {
  it('coerces numbers from query strings and rejects both cursors at once', () => {
    expect(messagesQuerySchema.parse({ beforeSeq: '10', limit: '5' })).toEqual({ beforeSeq: 10, limit: 5 });
    expect(messagesQuerySchema.safeParse({ beforeSeq: 1, afterSeq: 2 }).success).toBe(false);
  });
});
