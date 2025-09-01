// apps/web/src/services/socket.ts
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  timeout: 20000,
  retries: 3,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
