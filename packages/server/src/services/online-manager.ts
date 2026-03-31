import type { OnlineUser } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { getIo } from '../socket/context.js';

type OnlineSocketEntry = OnlineUser & {
  socketIds: Set<string>;
};

class OnlineManager {
  private readonly onlineUsers = new Map<string, OnlineSocketEntry>();

  async connect(data: OnlineUser & { socketId: string }) {
    const existing = this.onlineUsers.get(data.userId);
    this.onlineUsers.set(data.userId, {
      userId: data.userId,
      realName: data.realName,
      roleCode: data.roleCode,
      departmentId: data.departmentId,
      departmentName: data.departmentName,
      connectedAt: data.connectedAt,
      socketIds: new Set([...(existing?.socketIds ?? []), data.socketId]),
    });
    await prisma.session.updateMany({
      where: { userId: data.userId, socketId: data.socketId },
      data: { isOnline: true, lastActiveAt: new Date() },
    });
    this.broadcast();
  }

  async disconnect(userId: string, socketId: string) {
    const existing = this.onlineUsers.get(userId);
    if (!existing) {
      return;
    }

    existing.socketIds.delete(socketId);
    if (existing.socketIds.size > 0) {
      this.broadcast();
      return;
    }

    this.onlineUsers.delete(userId);
    await prisma.session.updateMany({
      where: { userId },
      data: { isOnline: false, socketId: null },
    });
    this.broadcast();
  }

  listAll() {
    return Array.from(this.onlineUsers.values()).map(({ socketIds: _socketIds, ...item }) => item);
  }

  listByDepartment(departmentId: string) {
    return this.listAll().filter((item) => item.departmentId === departmentId);
  }

  broadcast() {
    try {
      const io = getIo();
      const onlineUsers = this.listAll();
      io.emit('online:update', { onlineUsers, count: onlineUsers.length });
    } catch {
      // no-op before socket server boot
    }
  }
}

export const onlineManager = new OnlineManager();
