import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@exam-workflow/shared';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function setIo(server: Server<ClientToServerEvents, ServerToClientEvents>) {
  io = server;
}

export function getIo() {
  if (!io) {
    throw new Error('Socket.IO 未初始化');
  }

  return io;
}
