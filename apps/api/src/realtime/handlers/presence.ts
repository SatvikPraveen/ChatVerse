import { z } from 'zod';
import { presenceStatusSchema } from '@chatverse/protocol';
import { HEARTBEAT_TTL_SEC } from '../../services/presence.service.js';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

const setSchema = z.object({ status: presenceStatusSchema });
const emptySchema = z.undefined().or(z.null()).or(z.object({}).strict());

export function bindPresenceHandlers(
  ctx: GatewayContext,
  socket: AppSocket,
  bind: EventBinder,
): void {
  const { presence } = ctx.services;

  socket.on(
    'presence:set',
    bind.fire('presence:set', setSchema, async ({ status }) => {
      await presence.setStatus(socket.data.userId, status);
    }),
  );

  // `ping` doubles as the application-level heartbeat that keeps this socket's presence alive.
  socket.on('ping', (ack) => {
    bind.ack('ping', emptySchema, async () => {
      await presence.heartbeat(socket.data.userId, socket.id);
      return { serverTime: new Date().toISOString(), hlc: ctx.deps.clock.tick() };
    })(undefined, ack);
  });

  // Transport-level heartbeats also refresh presence so idle-but-connected clients stay online.
  const timer = setInterval(
    () => {
      presence.heartbeat(socket.data.userId, socket.id).catch(() => undefined);
    },
    (HEARTBEAT_TTL_SEC * 1000) / 3,
  );
  socket.on('disconnect', () => clearInterval(timer));
}
