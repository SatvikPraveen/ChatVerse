import type { Presence, PresenceStatus } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import { ConversationModel } from '../domain/models/index.js';
import { toObjectId } from '../lib/ids.js';

/**
 * Presence tracking that survives multiple devices and multiple server nodes.
 *
 * Redis layout per user:
 *   presence:{uid}:sockets   SET of socket ids across all nodes
 *   presence:{uid}:hb:{sid}  heartbeat key with TTL; a socket that stops heartbeating expires
 *   presence:{uid}           HASH {status, lastSeen}
 *
 * A user is online while at least one socket with a live heartbeat exists. Status changes are
 * broadcast only to users who share a conversation with them (looked up once and cached briefly)
 * instead of to everyone, which keeps presence traffic O(contacts) rather than O(users).
 */
export const HEARTBEAT_TTL_SEC = 45;
const CONTACTS_CACHE_SEC = 30;

export function createPresenceService(deps: Pick<Deps, 'redis' | 'hub'>) {
  const { redis, hub } = deps;
  const r = redis.client;
  const socketsKey = (uid: string) => `presence:${uid}:sockets`;
  const hbKey = (uid: string, sid: string) => `presence:${uid}:hb:${sid}`;
  const stateKey = (uid: string) => `presence:${uid}`;
  const contactsKey = (uid: string) => `presence:${uid}:contacts`;

  /** Prune socket ids whose heartbeat expired (node crash, lost disconnect). */
  async function liveSockets(userId: string): Promise<string[]> {
    const ids = await r.smembers(socketsKey(userId));
    if (ids.length === 0) return [];
    const alive: string[] = [];
    const dead: string[] = [];
    for (const sid of ids) ((await r.exists(hbKey(userId, sid))) ? alive : dead).push(sid);
    if (dead.length) await r.srem(socketsKey(userId), ...dead);
    return alive;
  }

  async function contactsOf(userId: string): Promise<string[]> {
    const cached = await r.get(contactsKey(userId));
    if (cached) return JSON.parse(cached) as string[];
    const convs = await ConversationModel.find({ 'participants.userId': toObjectId(userId) }).select('participants.userId');
    const ids = new Set<string>();
    for (const c of convs) for (const p of c.participants) ids.add(p.userId.toString());
    ids.delete(userId);
    const list = [...ids];
    await r.set(contactsKey(userId), JSON.stringify(list), 'EX', CONTACTS_CACHE_SEC);
    return list;
  }

  async function snapshot(userId: string): Promise<Presence> {
    const [state, sockets] = await Promise.all([r.hgetall(stateKey(userId)), liveSockets(userId)]);
    const deviceCount = sockets.length;
    const status = deviceCount === 0 ? 'offline' : ((state.status as PresenceStatus | undefined) ?? 'online');
    return { userId, status, lastSeen: state.lastSeen ?? new Date(0).toISOString(), deviceCount };
  }

  async function broadcast(userId: string): Promise<Presence> {
    const presence = await snapshot(userId);
    hub.toUsers(await contactsOf(userId), 'presence:changed', presence);
    return presence;
  }

  return {
    get: snapshot,

    async getMany(userIds: string[]): Promise<Presence[]> {
      return Promise.all(userIds.map(snapshot));
    },

    async connect(userId: string, socketId: string): Promise<Presence> {
      const now = new Date().toISOString();
      await r
        .multi()
        .sadd(socketsKey(userId), socketId)
        .set(hbKey(userId, socketId), '1', 'EX', HEARTBEAT_TTL_SEC)
        .hset(stateKey(userId), { lastSeen: now })
        .hsetnx(stateKey(userId), 'status', 'online')
        .exec();
      return broadcast(userId);
    },

    async heartbeat(userId: string, socketId: string): Promise<void> {
      await r.multi().set(hbKey(userId, socketId), '1', 'EX', HEARTBEAT_TTL_SEC).hset(stateKey(userId), { lastSeen: new Date().toISOString() }).exec();
    },

    async disconnect(userId: string, socketId: string): Promise<Presence> {
      await r.multi().srem(socketsKey(userId), socketId).del(hbKey(userId, socketId)).hset(stateKey(userId), { lastSeen: new Date().toISOString() }).exec();
      return broadcast(userId);
    },

    async setStatus(userId: string, status: Exclude<PresenceStatus, 'offline'>): Promise<Presence> {
      await r.hset(stateKey(userId), { status, lastSeen: new Date().toISOString() });
      return broadcast(userId);
    },

    /** Call when membership changes so contact lists are recomputed promptly. */
    async invalidateContacts(userIds: string[]): Promise<void> {
      if (userIds.length) await r.del(...userIds.map(contactsKey));
    },

    contactsOf,
  };
}

export type PresenceService = ReturnType<typeof createPresenceService>;
