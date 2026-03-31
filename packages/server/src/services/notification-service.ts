import type { NotificationType } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { getIo } from '../socket/context.js';

export async function createNotifications({
  userIds,
  type,
  title,
  content,
}: {
  userIds: string[];
  type: NotificationType | string;
  title: string;
  content: string;
}) {
  if (!userIds.length) {
    return;
  }

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, title, content })),
  });

  try {
    const io = getIo();
    for (const userId of userIds) {
      io.to(`user:${userId}`).emit('notification:new', {
        notificationId: `${Date.now()}`,
        title,
        content,
        type,
      });
    }
  } catch {
    // no-op when socket not ready
  }
}
