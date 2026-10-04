import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import type { Services } from '../services/index.js';
import type { IoServer } from './hub.js';

export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GatewayContext {
  io: IoServer;
  deps: Deps;
  services: Services;
}
