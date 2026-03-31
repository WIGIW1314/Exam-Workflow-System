import path from 'node:path';

export const env = {
  port: Number(process.env.PORT ?? 3200),
  jwtSecret: process.env.JWT_SECRET ?? 'exam-workflow-secret',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  rootDir: process.cwd(),
  uploadDir: path.join(process.cwd(), 'uploads'),
  backupDir: path.join(process.cwd(), 'backups'),
};
