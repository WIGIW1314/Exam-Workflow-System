import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../utils/auth.js';
import { unauthorized } from '../utils/errors.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw unauthorized('请先登录');
    }

    const payload = verifyToken(token);
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.token !== token || session.expiresAt < new Date()) {
      throw unauthorized('登录状态已失效，请重新登录');
    }

    req.user = payload;
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
    next();
  } catch (error) {
    next(error);
  }
}
