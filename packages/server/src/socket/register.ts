import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { onlineManager } from '../services/online-manager.js';
import { verifyToken } from '../utils/auth.js';

export function registerSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', async (socket) => {
    try {
      const token = String(socket.handshake.auth.token ?? '');
      const payload = verifyToken(token);
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: {
          user: {
            include: {
              department: true,
            },
          },
        },
      });
      if (!session || session.token !== token) {
        socket.disconnect();
        return;
      }

      await prisma.session.update({
        where: { id: session.id },
        data: {
          socketId: socket.id,
          isOnline: true,
          lastActiveAt: new Date(),
        },
      });

      socket.join('global');
      socket.join(`role:${payload.currentRole}`);
      socket.join(`user:${payload.userId}`);
      if (payload.departmentId) {
        socket.join(`department:${payload.departmentId}`);
      }

      await onlineManager.connect({
        userId: payload.userId,
        realName: session.user.realName,
        roleCode: payload.currentRole,
        departmentId: session.user.departmentId,
        departmentName: session.user.department?.name ?? null,
        connectedAt: new Date().toISOString(),
        socketId: socket.id,
      });

      socket.on('role:switch', async (roleCode, callback) => {
        if (!payload.roles.includes(roleCode)) {
          callback({ ok: false, message: '角色不存在' });
          return;
        }
        await prisma.session.update({
          where: { id: session.id },
          data: { currentRole: roleCode },
        });
        callback({ ok: true, message: '角色已切换，请刷新页面获取新菜单' });
      });

      socket.on('heartbeat', async (callback) => {
        await prisma.session.update({
          where: { id: session.id },
          data: { lastActiveAt: new Date() },
        });
        callback();
      });

      socket.on('room:join', (departmentId) => {
        socket.join(`department:${departmentId}`);
      });

      socket.on('disconnect', async () => {
        await onlineManager.disconnect(payload.userId);
      });
    } catch {
      socket.disconnect();
    }
  });
}
