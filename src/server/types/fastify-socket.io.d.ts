/**
 * Type augmentation for fastify-socket.io
 *
 * Extends Fastify instance to include the Socket.IO server
 */

import 'fastify';
import type { Server as SocketIOServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}
