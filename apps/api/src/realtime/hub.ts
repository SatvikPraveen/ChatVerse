import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerEventName, ServerToClientEvents, SocketData } from '@chatverse/protocol';
import { ROOMS } from '@chatverse/protocol';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

type Payload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * Indirection between domain services and the Socket.IO server. Services call the hub to fan
 * out events; the gateway binds the real server at startup. Before binding (and in unit tests)
 * every call is a no-op, so services never depend on the transport directly.
 *
 * All room operations go through `io.in(room)` so they work across nodes with the Redis adapter.
 */
export class RealtimeHub {
  private io: IoServer | null = null;

  bind(io: IoServer): void {
    this.io = io;
  }

  get server(): IoServer | null {
    return this.io;
  }

  toConversation<E extends ServerEventName>(conversationId: string, event: E, payload: Payload<E>): void {
    this.emitTo(ROOMS.conversation(conversationId), event, payload);
  }

  toUser<E extends ServerEventName>(userId: string, event: E, payload: Payload<E>): void {
    this.emitTo(ROOMS.user(userId), event, payload);
  }

  toUsers<E extends ServerEventName>(userIds: Iterable<string>, event: E, payload: Payload<E>): void {
    const rooms = [...new Set(userIds)].map(ROOMS.user);
    if (rooms.length === 0) return;
    this.emitTo(rooms, event, payload);
  }

  /** Make every socket of a user join a conversation room (e.g. after being added to a group). */
  joinUserToConversation(userId: string, conversationId: string): void {
    this.io?.in(ROOMS.user(userId)).socketsJoin(ROOMS.conversation(conversationId));
  }

  leaveUserFromConversation(userId: string, conversationId: string): void {
    this.io?.in(ROOMS.user(userId)).socketsLeave(ROOMS.conversation(conversationId));
  }

  private emitTo<E extends ServerEventName>(rooms: string | string[], event: E, payload: Payload<E>): void {
    if (!this.io) return;
    // The generic event map makes the spread hard for TS to express; the cast is local and typed above.
    (this.io.in(rooms).emit as (event: E, payload: Payload<E>) => void)(event, payload);
  }
}
