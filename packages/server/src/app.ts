import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cron from 'node-cron';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@exam-workflow/shared';
import { env } from './config/env.js';
import { enableSqlitePragmas, prisma } from './lib/prisma.js';
import { errorHandler } from './middlewares/error-handler.js';
import adminRoutes from './routes/admin.js';
import auditRoutes from './routes/audit.js';
import authRoutes from './routes/auth.js';
import docxTemplateRoutes from './routes/docx-templates.js';
import exportRoutes from './routes/export.js';
import notificationsRoutes from './routes/notifications.js';
import onlineRoutes from './routes/online.js';
import papersRoutes from './routes/papers.js';
import statsRoutes from './routes/stats.js';
import { setIo } from './socket/context.js';
import { registerSocketHandlers } from './socket/register.js';
import { logger } from './utils/logger.js';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: env.corsOrigin,
    credentials: true,
  },
});

setIo(io);
registerSocketHandlers(io);

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  '/api/v1/auth/login',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
  }),
);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/v1/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', timestamp: Date.now() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', adminRoutes);
app.use('/api/v1/papers', papersRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/docx-templates', docxTemplateRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/online', onlineRoutes);
app.use(errorHandler);

cron.schedule('0 2 * * *', async () => {
  try {
    await fs.mkdir(env.backupDir, { recursive: true });
    const source = path.join(process.cwd(), 'prisma', 'dev.db');
    const target = path.join(env.backupDir, `dev-${Date.now()}.db`);
    await fs.copyFile(source, target);
    logger.info(`Database backup created: ${target}`);
  } catch (error) {
    logger.error(`Backup failed: ${String(error)}`);
  }
});

async function bootstrap() {
  await enableSqlitePragmas();
  server.listen(env.port, () => {
    logger.info(`Server listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch(async (error) => {
  logger.error(String(error));
  await prisma.$disconnect();
  process.exit(1);
});
