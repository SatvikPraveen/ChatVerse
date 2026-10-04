import type { Conversation, EncryptedPayload, Message, OneTimePreKey, PreKeyBundle, PreKeyBundleUpload } from '@chatverse/protocol';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../storage';
import { E2EE, type KeyServer } from './e2ee';

/** In-memory stand-in for the key distribution endpoints, consuming one-time pre-keys on fetch. */
function fakeKeyServer() {
  const bundles = new Map<string, { userId: string; upload: PreKeyBundleUpload }>();
  /** userId -> device whose bundle is served (the most recently registered one). */
  const byUser = new Map<string, string>();
  const owner = new Map<string, string>();
  const server: KeyServer & { register(userId: string, deviceId: string): void } = {
    register(userId, deviceId) {
      byUser.set(userId, deviceId);
      owner.set(deviceId, userId);
    },
    async uploadBundle(upload) {
      const userId = owner.get(upload.deviceId);
      if (!userId) throw new Error('unregistered device');
      bundles.set(upload.deviceId, { userId, upload: structuredClone(upload) });
    },
    async uploadOneTime(deviceId, keys: OneTimePreKey[]) {
      bundles.get(deviceId)!.upload.oneTimePreKeys.push(...keys);
    },
    async fetchBundle(userId): Promise<PreKeyBundle> {
      const deviceId = byUser.get(userId)!;
      const b = bundles.get(deviceId)!;
      const opk = b.upload.oneTimePreKeys.shift() ?? null;
      const { identityKey, signingKey, signedPreKey } = b.upload;
      return { userId, deviceId, identityKey, signingKey, signedPreKey, oneTimePreKey: opk };
    },
    async countOneTime(deviceId) {
      const b = bundles.get(deviceId);
      return b ? b.upload.oneTimePreKeys.length : null;
    },
  };
  return server;
}

const direct: Conversation = {
  id: 'c'.repeat(24),
  kind: 'direct',
  name: null,
  topic: null,
  avatarUrl: null,
  createdBy: 'alice',
  participants: [
    { userId: 'alice', role: 'member', joinedAt: '', lastReadSeq: 0, lastDeliveredSeq: 0, muted: false },
    { userId: 'bob', role: 'member', joinedAt: '', lastReadSeq: 0, lastDeliveredSeq: 0, muted: false },
  ],
  encrypted: true,
  headSeq: 0,
  lastMessage: null,
  createdAt: '',
  updatedAt: '',
};

const group: Conversation = {
  ...direct,
  id: 'g'.repeat(24),
  kind: 'group',
  name: 'Team',
  participants: [...direct.participants, { userId: 'carol', role: 'member', joinedAt: '', lastReadSeq: 0, lastDeliveredSeq: 0, muted: false }],
};

let seq = 0;
function wire(conversationId: string, senderId: string, payload: EncryptedPayload): Message {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId,
    seq,
    clientMsgId: `cm${seq}`,
    senderId,
    kind: 'encrypted',
    text: null,
    encrypted: payload,
    attachments: [],
    replyTo: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    hlc: '0',
    createdAt: '',
    updatedAt: '',
  };
}

async function device(userId: string, deviceId: string, keyServer: ReturnType<typeof fakeKeyServer>) {
  keyServer.register(userId, deviceId);
  const storage = memoryStore();
  const e2ee = await E2EE.open({ userId, deviceId, storage, keyServer });
  return { e2ee, storage };
}

describe('E2EE engine', () => {
  it('direct conversation: first message bootstraps the session via X3DH and both directions work', async () => {
    const ks = fakeKeyServer();
    const alice = await device('alice', 'alice-dev-00001', ks);
    const bob = await device('bob', 'bob-dev-0000001', ks);

    const { payload, preamble } = await alice.e2ee.encrypt(direct, 'hello bob');
    expect(preamble).toEqual([]);
    const m1 = wire(direct.id, 'alice', payload);
    expect(await bob.e2ee.decrypt(direct, m1)).toEqual({ kind: 'text', text: 'hello bob' });
    // Decrypting again is served from the plaintext cache, not the (single-use) message key.
    expect(await bob.e2ee.decrypt(direct, m1)).toEqual({ kind: 'text', text: 'hello bob' });

    const reply = await bob.e2ee.encrypt(direct, 'hi alice');
    expect(await alice.e2ee.decrypt(direct, wire(direct.id, 'bob', reply.payload))).toEqual({ kind: 'text', text: 'hi alice' });

    expect(alice.e2ee.safetyNumberWith('bob')).toBe(bob.e2ee.safetyNumberWith('alice'));
    expect(alice.e2ee.safetyNumberWith('bob')).toMatch(/^(\d{5} ){11}\d{5}$/);
  });

  it('state survives a reload (re-open from the same storage)', async () => {
    const ks = fakeKeyServer();
    const alice = await device('alice', 'alice-dev-00001', ks);
    const bob = await device('bob', 'bob-dev-0000001', ks);
    const first = await alice.e2ee.encrypt(direct, 'one');
    await bob.e2ee.decrypt(direct, wire(direct.id, 'alice', first.payload));

    const alice2 = await E2EE.open({ userId: 'alice', deviceId: 'alice-dev-00001', storage: alice.storage, keyServer: ks });
    const bob2 = await E2EE.open({ userId: 'bob', deviceId: 'bob-dev-0000001', storage: bob.storage, keyServer: ks });
    const second = await bob2.encrypt(direct, 'two');
    expect(await alice2.decrypt(direct, wire(direct.id, 'bob', second.payload))).toEqual({ kind: 'text', text: 'two' });
  });

  it('messages addressed to another device of ours are reported, not decrypted', async () => {
    const ks = fakeKeyServer();
    const alice = await device('alice', 'alice-dev-00001', ks);
    await device('bob', 'bob-dev-0000001', ks);
    const bob2 = await device('bob', 'bob-dev-0000002', ks); // replaces bob's registered device
    const { payload } = await alice.e2ee.encrypt(direct, 'for device 2');
    const bob1 = await E2EE.open({ userId: 'bob', deviceId: 'bob-dev-0000001', storage: memoryStore(), keyServer: ks });
    expect(await bob1.decrypt(direct, wire(direct.id, 'alice', payload))).toEqual({ kind: 'other-device' });
    expect(await bob2.e2ee.decrypt(direct, wire(direct.id, 'alice', payload))).toEqual({ kind: 'text', text: 'for device 2' });
  });

  it('group conversation: sender keys are distributed through pairwise control messages', async () => {
    const ks = fakeKeyServer();
    const alice = await device('alice', 'alice-dev-00001', ks);
    const bob = await device('bob', 'bob-dev-0000001', ks);
    const carol = await device('carol', 'carol-dev-00001', ks);

    const { payload, preamble } = await alice.e2ee.encrypt(group, 'hello team');
    expect(preamble).toHaveLength(2); // one distribution per other member
    const controls = preamble.map((p) => wire(group.id, 'alice', p));
    const msg = wire(group.id, 'alice', payload);

    // Group message arriving before the distribution waits for keys.
    expect(await bob.e2ee.decrypt(group, msg)).toEqual({ kind: 'waiting-keys' });

    const bobOutcomes = await Promise.all(controls.map((c) => bob.e2ee.decrypt(group, c)));
    expect(bobOutcomes).toContainEqual({ kind: 'control', conversationId: group.id });
    expect(bobOutcomes).toContainEqual({ kind: 'hidden' });
    expect(await bob.e2ee.decrypt(group, msg)).toEqual({ kind: 'text', text: 'hello team' });

    for (const c of controls) await carol.e2ee.decrypt(group, c);
    expect(await carol.e2ee.decrypt(group, msg)).toEqual({ kind: 'text', text: 'hello team' });

    // Subsequent messages need no preamble.
    const next = await alice.e2ee.encrypt(group, 'second');
    expect(next.preamble).toEqual([]);
    expect(await carol.e2ee.decrypt(group, wire(group.id, 'alice', next.payload))).toEqual({ kind: 'text', text: 'second' });
  });

  it('group: membership change rotates the sender key', async () => {
    const ks = fakeKeyServer();
    const alice = await device('alice', 'alice-dev-00001', ks);
    const bob = await device('bob', 'bob-dev-0000001', ks);
    await device('carol', 'carol-dev-00001', ks);

    const first = await alice.e2ee.encrypt(group, 'with carol');
    for (const p of first.preamble) await bob.e2ee.decrypt(group, wire(group.id, 'alice', p));
    await bob.e2ee.decrypt(group, wire(group.id, 'alice', first.payload));

    const smaller: Conversation = { ...group, participants: group.participants.filter((p) => p.userId !== 'carol') };
    const second = await alice.e2ee.encrypt(smaller, 'without carol');
    expect(second.preamble).toHaveLength(1); // rotated: bob gets a new distribution
    for (const p of second.preamble) await bob.e2ee.decrypt(smaller, wire(group.id, 'alice', p));
    expect(await bob.e2ee.decrypt(smaller, wire(group.id, 'alice', second.payload))).toEqual({ kind: 'text', text: 'without carol' });
  });

  it('replenishes one-time pre-keys when the server runs low and re-uploads when forgotten', async () => {
    const ks = fakeKeyServer();
    const bob = await device('bob', 'bob-dev-0000001', ks);
    expect(await ks.countOneTime('bob-dev-0000001')).toBe(50);
    for (let i = 0; i < 45; i++) await ks.fetchBundle('bob');
    await bob.e2ee.ensureServerHasKeys();
    expect(await ks.countOneTime('bob-dev-0000001')).toBe(55);
  });
});
