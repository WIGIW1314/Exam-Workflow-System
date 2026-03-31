import type { OnlineUser } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { getIo } from '../socket/context.js';

class OnlineManager {
  private readonly onlineUsers = new Map<string, OnlineUser & { socketId: string }>();

  async connect(data: OnlineUser & { socketId: string }) {
    this.onlineUsers.set(data.userId, data);
    await prisma.session.updateMany({
      where: { userId: data.userId, socketId: data.socketId },
      data: { isOnline: true, lastActiveAt: new Date() },
    });
    this.broadcast();
  }

  async disconnect(userId: string) {
    this.onlineUsers.delete(userId);
    await prisma.session.updateMany({
      where: { userId },
      data: { isOnline: false, socketId: null },
    });
    this.broadcast();
  }

  listAll() {
    return Array.from(this.onlineUsers.values());
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
